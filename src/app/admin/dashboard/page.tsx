import { Timestamp } from 'firebase-admin/firestore';
import AdminMetricCard from '@/components/AdminMetricCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdminSession } from '@/lib/admin/server';

type GenericRow = Record<string, unknown>;
type MonetizationSummary = {
  free: number;
  basic: number;
  premium: number;
  revenueCents: number;
};

function toMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'object' && value && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = (value as { _seconds?: number })._seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function familyAccountCount(users: GenericRow[]) {
  return users.filter((row) => {
    const accountType = String(row.accountType || '');
    const role = String(row.role || '');
    return accountType === 'family' || ['parent', 'sitter', 'reciprocal'].includes(role);
  }).length;
}

function verificationCounts(users: GenericRow[]) {
  const counts = {
    verified: 0,
    pending: 0,
    rejected: 0,
    unverified: 0,
  };

  users.forEach((row) => {
    const status = String(row.verificationStatus || 'unverified') as keyof typeof counts;
    if (status in counts) counts[status] += 1;
  });

  return counts;
}

function defaultAccess(row: GenericRow) {
  const access = (row.access && typeof row.access === 'object' ? row.access : null) as GenericRow | null;
  return {
    source: String(access?.source || 'manual'),
    status: String(access?.status || 'inactive'),
    notes: String(access?.notes || ''),
    updatedAt: access?.updatedAt,
    matchesRemaining: access?.limits && typeof access.limits === 'object' ? (access.limits as GenericRow).matchesRemaining : undefined,
    messagesRemaining: access?.limits && typeof access.limits === 'object' ? (access.limits as GenericRow).messagesRemaining : undefined,
    proposalsRemaining: access?.limits && typeof access.limits === 'object' ? (access.limits as GenericRow).proposalsRemaining : undefined,
  };
}

function planTierOf(row: GenericRow) {
  const access = (row.access && typeof row.access === 'object' ? row.access : null) as GenericRow | null;
  const billing = (row.billing && typeof row.billing === 'object' ? row.billing : null) as GenericRow | null;
  const subscription = (row.subscription && typeof row.subscription === 'object' ? row.subscription : null) as GenericRow | null;
  const rawTier =
    row.planTier ||
    access?.planTier ||
    billing?.planTier ||
    subscription?.tier ||
    'free';

  const normalized = String(rawTier || 'free').toLowerCase();
  if (normalized === 'premium') return 'premium';
  if (normalized === 'basic') return 'basic';
  return 'free';
}

function revenueCentsOf(row: GenericRow) {
  const billing = (row.billing && typeof row.billing === 'object' ? row.billing : null) as GenericRow | null;
  const subscription = (row.subscription && typeof row.subscription === 'object' ? row.subscription : null) as GenericRow | null;
  const directRevenue =
    row.totalRevenueCents ??
    row.lifetimeRevenueCents ??
    row.revenueCents ??
    billing?.totalRevenueCents ??
    billing?.lifetimeRevenueCents ??
    subscription?.totalPaidCents ??
    0;

  return asNumber(directRevenue);
}

function monetizationSummary(rows: GenericRow[]): MonetizationSummary {
  return rows.reduce<MonetizationSummary>(
    (summary, row) => {
      const tier = planTierOf(row);
      const cents = revenueCentsOf(row);
      summary[tier] += 1;
      summary.revenueCents += cents;
      return summary;
    },
    {
      free: 0,
      basic: 0,
      premium: 0,
      revenueCents: 0,
    }
  );
}

function dollarsFromCents(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function isEmployerAccount(row: GenericRow) {
  return String(row.accountType || '') === 'employer';
}

function isFamilyAccount(row: GenericRow) {
  const accountType = String(row.accountType || '');
  const role = String(row.role || '');
  return accountType === 'family' || ['parent', 'sitter', 'reciprocal'].includes(role);
}

function summarizeAccess(rows: GenericRow[]) {
  const summary = {
    active: 0,
    inactive: 0,
    code: 0,
    manual: 0,
    plan: 0,
  };

  rows.forEach((row) => {
    const access = defaultAccess(row);
    if (access.status === 'active') summary.active += 1;
    else summary.inactive += 1;

    if (access.source === 'code') summary.code += 1;
    else if (access.source === 'plan') summary.plan += 1;
    else summary.manual += 1;
  });

  return summary;
}

function countByAccess(rows: GenericRow[], source: 'code' | 'manual' | 'plan', status?: 'active' | 'inactive') {
  return rows.filter((row) => {
    const access = defaultAccess(row);
    if (access.source !== source) return false;
    if (!status) return true;
    return access.status === status;
  }).length;
}

function startOfDayMillis(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function buildTrendBuckets(rows: GenericRow[], key: 'createdAt', days: number) {
  const buckets = new Map<number, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = days - 1; index >= 0; index -= 1) {
    const pointDate = new Date(today);
    pointDate.setDate(today.getDate() - index);
    buckets.set(pointDate.getTime(), 0);
  }

  rows.forEach((row) => {
    const value = toMillis(row[key]);
    if (!value) return;
    const dayKey = startOfDayMillis(value);
    if (!buckets.has(dayKey)) return;
    buckets.set(dayKey, (buckets.get(dayKey) || 0) + 1);
  });

  return Array.from(buckets.entries()).map(([time, total]) => ({
    label: new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    total,
  }));
}

function previousWindowCount(rows: GenericRow[], key: 'createdAt', windowStart: number, windowSizeMs: number) {
  const previousStart = windowStart - windowSizeMs;
  return rows.filter((row) => {
    const value = toMillis(row[key]);
    return value >= previousStart && value < windowStart;
  }).length;
}

function trendLabel(current: number, previous: number, noun: string) {
  const delta = current - previous;
  if (delta > 0) return `Up ${delta} vs previous period in ${noun}`;
  if (delta < 0) return `Down ${Math.abs(delta)} vs previous period in ${noun}`;
  return `Flat vs previous period in ${noun}`;
}

function accessTrendRows(rows: GenericRow[]) {
  return rows.map((row) => {
    const access = defaultAccess(row);
    return {
      ...row,
      createdAt: access.updatedAt || row.createdAt || null,
    };
  });
}

export default async function AdminDashboardPage() {
  await requireAdminSession();

  const db = adminDb();
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMillis = todayStart.getTime();
  const recentMessagesPromise = db.collectionGroup('messages')
    .where('createdAt', '>=', Timestamp.fromMillis(sevenDaysAgo))
    .get()
    .catch(async (error) => {
      if (String((error as { code?: unknown })?.code || '') === '9') {
        return db.collectionGroup('messages').get();
      }

      throw error;
    });

  const [
    usersSnap,
    swipesSnap,
    matchesSnap,
    conversationsSnap,
    recentMessagesSnap,
    shiftsSnap,
    reviewsSnap,
    accessCodesSnap,
    redemptionsSnap,
  ] = await Promise.all([
    db.collection('users').get(),
    db.collection('swipes').get(),
    db.collection('matches').get(),
    db.collection('conversations').get(),
    recentMessagesPromise,
    db.collection('shifts').get(),
    db.collection('reviews').get(),
    db.collection('access_codes').get(),
    db.collection('redemptions').orderBy('createdAt', 'desc').limit(20).get().catch(async () => db.collection('redemptions').limit(20).get()),
  ]);

  const users = usersSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const matches = matchesSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const conversations = conversationsSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const shifts = shiftsSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const reviews = reviewsSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const codes = accessCodesSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const redemptions = redemptionsSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];
  const allMessageRows = recentMessagesSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as GenericRow[];

  const verification = verificationCounts(users);
  const employerUsers = users.filter((row) => isEmployerAccount(row));
  const familyUsers = users.filter((row) => isFamilyAccount(row));
  const employersCount = employerUsers.length;
  const familiesCount = familyAccountCount(users);
  const usersWithLastSeen = users.filter((row) => toMillis(row.lastSeen) >= sevenDaysAgo).length;
  const familyAccess = summarizeAccess(familyUsers);
  const employerAccess = summarizeAccess(employerUsers);
  const familyCodeUsers = countByAccess(familyUsers, 'code');
  const employerCodeUsers = countByAccess(employerUsers, 'code');
  const familyPlanUsers = countByAccess(familyUsers, 'plan');
  const employerPlanUsers = countByAccess(employerUsers, 'plan');
  const familyActivePlans = countByAccess(familyUsers, 'plan', 'active');
  const employerActivePlans = countByAccess(employerUsers, 'plan', 'active');
  const familyMonetization = monetizationSummary(familyUsers);
  const employerMonetization = monetizationSummary(employerUsers);
  const totalRevenueCents = familyMonetization.revenueCents + employerMonetization.revenueCents;
  const windowSizeMs = 7 * 24 * 60 * 60 * 1000;

  const matchesToday = matches.filter((row) => toMillis(row.createdAt) >= todayMillis).length;
  const matchesLast7Days = matches.filter((row) => toMillis(row.createdAt) >= sevenDaysAgo).length;
  const previousMatchesLast7Days = previousWindowCount(matches, 'createdAt', sevenDaysAgo, windowSizeMs);
  const compatibilityValues = matches
    .map((row) => asNumber(row.compatibilityScore))
    .filter((value) => value > 0);
  const avgCompatibility = compatibilityValues.length
    ? Math.round((compatibilityValues.reduce((sum, value) => sum + value, 0) / compatibilityValues.length) * 10) / 10
    : null;

  const conversationPairs = new Set(
    conversations
      .map((row) => Array.isArray(row.userIds) ? (row.userIds as string[]) : [])
      .filter((ids) => ids.length === 2)
      .map((ids) => [...ids].sort().join('_'))
  );
  const matchesReachedMessaging = matches.filter((row) => {
    const ids = Array.isArray(row.userIds)
      ? (row.userIds as string[])
      : Array.isArray(row.uids)
        ? (row.uids as string[])
        : [String(row.uid1 || ''), String(row.uid2 || '')].filter(Boolean);
    if (ids.length !== 2) return false;
    return conversationPairs.has([...ids].sort().join('_'));
  }).length;
  const messagingRate = matches.length ? Math.round((matchesReachedMessaging / matches.length) * 100) : 0;

  const recentMessageDocs = allMessageRows.filter((row) => toMillis(row.createdAt) >= sevenDaysAgo);
  const messagesToday = recentMessageDocs.filter((row) => toMillis(row.createdAt) >= todayMillis).length;
  const messagesLast7Days = recentMessageDocs.length;
  const previousMessagesLast7Days = previousWindowCount(allMessageRows, 'createdAt', sevenDaysAgo, windowSizeMs);

  const shiftStatusCounts = {
    proposed: 0,
    accepted: 0,
    declined: 0,
    completed: 0,
    cancelled: 0,
  };
  const cancellationReasons = new Map<string, number>();

  shifts.forEach((row) => {
    const status = String(row.status || '');
    if (status === 'proposed') shiftStatusCounts.proposed += 1;
    if (status === 'accepted') shiftStatusCounts.accepted += 1;
    if (status === 'rejected' || status === 'declined') shiftStatusCounts.declined += 1;
    if (status === 'completed') shiftStatusCounts.completed += 1;
    if (status === 'cancelled') {
      shiftStatusCounts.cancelled += 1;
      const reason = String(row.cancelReasonCode || row.cancelReasonText || 'unspecified');
      cancellationReasons.set(reason, (cancellationReasons.get(reason) || 0) + 1);
    }
  });

  const reviewsAverage = reviews.length
    ? Math.round((reviews.reduce((sum, row) => sum + asNumber(row.rating), 0) / reviews.length) * 10) / 10
    : 0;
  const shiftsLast7Days = shifts.filter((row) => toMillis(row.createdAt) >= sevenDaysAgo).length;
  const previousShiftsLast7Days = previousWindowCount(shifts, 'createdAt', sevenDaysAgo, windowSizeMs);

  const totalCodesRedeemed = codes.filter((row) => String(row.status || '') === 'redeemed').length;
  const redemptionRate = codes.length ? Math.round((totalCodesRedeemed / codes.length) * 100) : 0;

  const employerBreakdown = Array.from(
    codes.reduce((map, row) => {
      const employerId = String(row.employerId || 'unknown');
      const current = map.get(employerId) || { employerId, total: 0, redeemed: 0 };
      current.total += 1;
      if (String(row.status || '') === 'redeemed') current.redeemed += 1;
      map.set(employerId, current);
      return map;
    }, new Map<string, { employerId: string; total: number; redeemed: number }>())
      .values()
  )
    .sort((a, b) => b.redeemed - a.redeemed || b.total - a.total)
    .slice(0, 5);

  const recentAccessRows = users.slice(0, 12).map((row) => ({
    id: String(row.id || ''),
    email: String(row.email || ''),
    accountType: String(row.accountType || row.role || 'unknown'),
    access: defaultAccess(row),
  }));

  const userTrend = buildTrendBuckets(users, 'createdAt', 7);
  const matchTrend = buildTrendBuckets(matches, 'createdAt', 7);
  const messageTrend = buildTrendBuckets(allMessageRows, 'createdAt', 7);
  const shiftTrend = buildTrendBuckets(shifts, 'createdAt', 7);
  const codesTrend = buildTrendBuckets(codes, 'createdAt', 7);
  const redeemedTrend = buildTrendBuckets(redemptions, 'createdAt', 7);
  const familyAccessTrend = buildTrendBuckets(accessTrendRows(familyUsers), 'createdAt', 7);
  const employerAccessTrend = buildTrendBuckets(accessTrendRows(employerUsers), 'createdAt', 7);

  return (
    <div className="container mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl">Admin Dashboard</CardTitle>
          <CardDescription>Operational metrics for users, matching, messaging, shifts, codes, and access.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <AdminMetricCard
          title="Users"
          description="Mix by account type and verification health."
          seriesLabel="New users"
          seriesColor="#0f766e"
          points={userTrend.map((point) => ({ label: point.label, value: point.total }))}
          rows={[
            { label: 'Total users', value: String(users.length) },
            { label: 'Families', value: `${familiesCount} (${users.length ? Math.round((familiesCount / users.length) * 100) : 0}%)` },
            { label: 'Employers', value: `${employersCount} (${users.length ? Math.round((employersCount / users.length) * 100) : 0}%)` },
            { label: 'Verified', value: String(verification.verified) },
            { label: 'Pending', value: String(verification.pending) },
            { label: 'Rejected', value: String(verification.rejected) },
            { label: 'Unverified', value: String(verification.unverified) },
          ]}
        />

        <AdminMetricCard
          title="Matching"
          description="Volume plus funnel quality."
          seriesLabel="Matches"
          seriesColor="#2563eb"
          points={matchTrend.map((point) => ({ label: point.label, value: point.total }))}
          rows={[
            { label: 'Total swipes', value: String(swipesSnap.size) },
            { label: 'Total matches', value: String(matches.length) },
            { label: 'Matches today', value: String(matchesToday) },
            { label: 'Matches last 7 days', value: String(matchesLast7Days) },
            { label: 'Trend', value: trendLabel(matchesLast7Days, previousMatchesLast7Days, 'matches'), tone: 'muted' },
            { label: 'Avg compatibility', value: avgCompatibility == null ? 'Not stored' : String(avgCompatibility) },
            { label: 'Reached messaging', value: `${messagingRate}%` },
          ]}
        />

        <AdminMetricCard
          title="Messaging + Activity"
          description="Current traffic and recent activity."
          seriesLabel="Messages"
          seriesColor="#1d4ed8"
          points={messageTrend.map((point) => ({ label: point.label, value: point.total }))}
          rows={[
            { label: 'Total conversations', value: String(conversations.length) },
            { label: 'Messages today', value: String(messagesToday) },
            { label: 'Messages last 7 days', value: String(messagesLast7Days) },
            { label: 'Trend', value: trendLabel(messagesLast7Days, previousMessagesLast7Days, 'messages'), tone: 'muted' },
            { label: 'Active users (7d)', value: String(usersWithLastSeen) },
          ]}
        />

        <AdminMetricCard
          title="Shifts"
          description="Operational outcomes and review health."
          seriesLabel="Shifts"
          seriesColor="#ea580c"
          points={shiftTrend.map((point) => ({ label: point.label, value: point.total }))}
          rows={[
            { label: 'Total shifts', value: String(shifts.length) },
            { label: 'Shifts last 7 days', value: String(shiftsLast7Days) },
            { label: 'Trend', value: trendLabel(shiftsLast7Days, previousShiftsLast7Days, 'shifts'), tone: 'muted' },
            { label: 'Proposed', value: String(shiftStatusCounts.proposed) },
            { label: 'Accepted', value: String(shiftStatusCounts.accepted) },
            { label: 'Declined', value: String(shiftStatusCounts.declined) },
            { label: 'Completed', value: String(shiftStatusCounts.completed) },
            { label: 'Cancelled', value: String(shiftStatusCounts.cancelled) },
            { label: 'Reviews', value: `${reviews.length} (${reviewsAverage} avg)` },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Codes & Access</CardTitle>
          <CardDescription>Code generation, redemption, and current access source/status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              title="Codes Generated"
              description="How many employer codes were created."
              seriesLabel="Codes"
              seriesColor="#7c3aed"
              points={codesTrend.map((point) => ({ label: point.label, value: point.total }))}
              rows={[
                { label: 'Total codes generated', value: String(codes.length) },
                { label: 'Employer groups', value: String(employerBreakdown.length) },
              ]}
            />
            <AdminMetricCard
              title="Codes Redeemed"
              description="Code usage and redemption velocity."
              seriesLabel="Redeemed"
              seriesColor="#0f766e"
              points={redeemedTrend.map((point) => ({ label: point.label, value: point.total }))}
              rows={[
                { label: 'Total redeemed', value: String(totalCodesRedeemed) },
                { label: 'Redemption rate', value: `${redemptionRate}%` },
                { label: 'Records', value: String(redemptions.length) },
              ]}
            />
            <AdminMetricCard
              title="Families Access"
              description="Family accounts using code, manual, or plan."
              seriesLabel="Family access"
              seriesColor="#0891b2"
              points={familyAccessTrend.map((point) => ({ label: point.label, value: point.total }))}
              rows={[
                { label: 'Family users', value: String(familyUsers.length) },
                { label: 'Active', value: String(familyAccess.active) },
                { label: 'Code users', value: String(familyCodeUsers) },
                { label: 'Plan users', value: String(familyPlanUsers) },
                { label: 'Active plans', value: String(familyActivePlans) },
              ]}
            />
            <AdminMetricCard
              title="Employers Access"
              description="Employer accounts using code, manual, or plan."
              seriesLabel="Employer access"
              seriesColor="#db2777"
              points={employerAccessTrend.map((point) => ({ label: point.label, value: point.total }))}
              rows={[
                { label: 'Employer users', value: String(employerUsers.length) },
                { label: 'Active', value: String(employerAccess.active) },
                { label: 'Code users', value: String(employerCodeUsers) },
                { label: 'Plan users', value: String(employerPlanUsers) },
                { label: 'Active plans', value: String(employerActivePlans) },
              ]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Families Payments / Plans</p>
              <p>Manual access: {familyAccess.manual}</p>
              <p>Inactive access: {familyAccess.inactive}</p>
              <p>Code access: {familyAccess.code}</p>
              <p>Plan access: {familyAccess.plan}</p>
              <p className="text-muted-foreground">Payments live: No, access tracking only.</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="font-semibold">Employers Payments / Plans</p>
              <p>Manual access: {employerAccess.manual}</p>
              <p>Inactive access: {employerAccess.inactive}</p>
              <p>Code access: {employerAccess.code}</p>
              <p>Plan access: {employerAccess.plan}</p>
              <p className="text-muted-foreground">Payments live: No, access tracking only.</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Top employers by code usage</h3>
            <div className="space-y-2 text-sm">
              {employerBreakdown.length === 0 ? (
                <p className="text-muted-foreground">No employer code activity yet.</p>
              ) : employerBreakdown.map((row) => (
                <div key={row.employerId} className="rounded-xl border p-3">
                  <p>Employer: {row.employerId}</p>
                  <p>Generated: {row.total}</p>
                  <p>Redeemed: {row.redeemed}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Recent redemptions</h3>
            <div className="space-y-2 text-sm">
              {redemptions.length === 0 ? (
                <p className="text-muted-foreground">No recent redemptions.</p>
              ) : redemptions.map((row) => (
                <div key={String(row.id)} className="rounded-xl border p-3">
                  <p>Employer: {String(row.employerId || 'unknown')}</p>
                  <p>Code: {String(row.code || 'unknown')}</p>
                  <p>Redeemed by: {String(row.userId || row.redeemedByUid || 'unknown')}</p>
                  <p>Redeemed at: {toMillis(row.createdAt) ? new Date(toMillis(row.createdAt)).toLocaleString() : 'Unknown'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Recent entitlements snapshot</h3>
            <div className="space-y-2 text-sm">
              {recentAccessRows.map((row) => (
                <div key={row.id} className="rounded-xl border p-3">
                  <p>{row.email || row.id}</p>
                  <p>Type: {row.accountType}</p>
                  <p>Source: {row.access.source}</p>
                  <p>Status: {row.access.status}</p>
                  <p>
                    Limits:
                    {' '}
                    matches={row.access.matchesRemaining == null ? 'n/a' : String(row.access.matchesRemaining)}
                    {' • '}
                    messages={row.access.messagesRemaining == null ? 'n/a' : String(row.access.messagesRemaining)}
                    {' • '}
                    proposals={row.access.proposalsRemaining == null ? 'n/a' : String(row.access.proposalsRemaining)}
                  </p>
                  {row.access.notes ? <p>Notes: {row.access.notes}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cancellations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Array.from(cancellationReasons.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => (
              <p key={reason}>{reason}: {count}</p>
            ))}
          {cancellationReasons.size === 0 ? <p className="text-muted-foreground">No cancellations recorded.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monetization Readiness</CardTitle>
          <CardDescription>Prepared plan metrics for families and employers. Values stay at zero until billing is enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">Families Plans</p>
              <p>Free: {familyMonetization.free}</p>
              <p>Basic: {familyMonetization.basic}</p>
              <p>Premium: {familyMonetization.premium}</p>
              <p>Revenue: {dollarsFromCents(familyMonetization.revenueCents)}</p>
              <p className="text-muted-foreground">Billing status: {familyMonetization.revenueCents > 0 ? 'Active' : 'Not active yet'}</p>
            </div>
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">Employers Plans</p>
              <p>Free: {employerMonetization.free}</p>
              <p>Basic: {employerMonetization.basic}</p>
              <p>Premium: {employerMonetization.premium}</p>
              <p>Revenue: {dollarsFromCents(employerMonetization.revenueCents)}</p>
              <p className="text-muted-foreground">Billing status: {employerMonetization.revenueCents > 0 ? 'Active' : 'Not active yet'}</p>
            </div>
            <div className="rounded-xl border p-4 text-sm">
              <p className="font-semibold">Total Revenue</p>
              <p>Families + Employers: {dollarsFromCents(totalRevenueCents)}</p>
              <p>Families on paid tiers: {familyMonetization.basic + familyMonetization.premium}</p>
              <p>Employers on paid tiers: {employerMonetization.basic + employerMonetization.premium}</p>
              <p className="text-muted-foreground">This block updates automatically when plan fields start being stored.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
