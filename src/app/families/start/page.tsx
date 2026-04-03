import Link from "next/link"

export default function FamiliesStartPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <div className="rounded-3xl border border-border/60 bg-white/80 p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Families
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">
          Let&apos;s get you set up for your first match.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Create your family profile, verify your account, and start connecting
          with trusted nearby families who need help on similar schedules.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/families/onboarding" className="ss-btn text-center">
            Start onboarding
          </Link>
          <Link href="/families" className="ss-btn-outline text-center">
            I already have an account
          </Link>
        </div>
      </div>
    </main>
  )
}
