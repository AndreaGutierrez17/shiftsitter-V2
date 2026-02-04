export default function HomePage() {
  return (
    <>
      <section className="hero-split">
        <video
          className="hero-split-media"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/ShiftSitter.jpeg"
        >
          <source src="/hero-shiftsitter.mp4" type="video/mp4" />
        </video>

        <div className="hero-split-tint" />

        <div className="hero-split-inner">
          <div className="hero-split-card" id="how-it-works">
            <h1 className="hero-split-title">
              ShiftSitter - <span>your reciprocal childcare platform.</span>
            </h1>

            <p className="hero-split-copy">
              A verified, trust-based community where parents support parents -
              built for real shift schedules, nights, weekends, and rotating
              hours.
            </p>

            <div className="hero-split-actions">
              <a href="/signup" className="ss-btn hero-split-cta">
                Get started
              </a>
              <a href="#how" className="ss-btn-outline hero-split-cta-outline">
                Learn how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* QUITADO: Maryland note + countdown + early access + no commitments */}

      <section id="how" className="py-5">
        <div className="container">
          <div className="row g-4 align-items-center">
            <div className="col-lg-6">
              <div className="card feature-card accent-2 p-4 h-100">
                <div className="text-center mb-3">
                  <span className="icon-badge-xl">
                    <i className="bi bi-heart-pulse-fill"></i>
                  </span>
                </div>
                <h3 className="text-center mb-3">How it Works</h3>
                <p className="mb-2 text-muted-strong text-center">
                  Parents supporting parents - be <strong>matched</strong> with
                  nearby mums and dads like you and enter into a reciprocal
                  caregiving arrangement that fits your schedule and lifestyle.
                </p>
                <p className="mb-0 text-muted-strong text-center">
                  <strong>No cost</strong>, just smart matching and shared
                  trust.
                </p>
              </div>
            </div>

            <div className="col-lg-6">
              <img
                src="/ShiftSitter.jpeg"
                className="img-fluid rounded-4 shadow-soft"
                alt="Parents helping parents illustration"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-5">
        <div className="container">
          <h2 className="text-center mb-4 features-title">Features</h2>

          <div className="row g-4">
            <div className="col-md-4">
              <div className="card feature-card accent-1 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-shield-check"></i>
                </span>
                <h5 className="feature-heading">Trusted &amp; Safe</h5>
                <p className="text-muted-strong mb-0">
                  ID verification, checks, geo-fencing and roaming safeguards.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card feature-card accent-2 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-calendar2-week"></i>
                </span>
                <h5 className="feature-heading">Schedule Sync</h5>
                <p className="text-muted-strong mb-0">
                  Real-time pairing by shift availability and proximity.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card feature-card accent-3 p-4 h-100 text-center">
                <span className="icon-badge-xl mb-3">
                  <i className="bi bi-people"></i>
                </span>
                <h5 className="feature-heading">Local Reciprocity</h5>
                <p className="text-muted-strong mb-0">Parents helping parents.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="partners" className="py-5 section-deep">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-6">
              <div className="d-flex align-items-center mb-3">
                <img
                  src="/logo-shiftsitter.png"
                  alt="ShiftSitter logo"
                  className="me-2 partner-logo"
                />
                <h2 className="fw-800 m-0 text-accent">
                  For Employers &amp; CSR Partners
                </h2>
              </div>

              <p className="mb-1">
                <em>Support the people who support everyone else.</em>
              </p>
              <p className="mb-3">
                Provide 12-month platform access for your workforce, or sponsor
                local shift-working parents to help them find trusted,
                reciprocal childcare within their community.
              </p>

              <ul className="list-unstyled small mb-3">
                <li className="feature-bullet">
                  <i className="bi bi-graph-up-arrow"></i>
                  <span>
                    Every $1,000 in sponsorship helps 50+ families stay in the
                    workforce
                  </span>
                </li>
                <li className="feature-bullet">
                  <i className="bi bi-people-fill"></i>
                  <span>Reduces absenteeism by up to 30%</span>
                </li>
                <li className="feature-bullet">
                  <i className="bi bi-heart-pulse-fill"></i>
                  <span>
                    Retains an estimated $250K+ value per 100 employees
                    supported
                  </span>
                </li>
              </ul>

              <a
                className="btn btn-primary-soft"
                data-bs-toggle="offcanvas"
                href="#partnerDrawer"
                role="button"
                aria-controls="partnerDrawer"
              >
                Become a Sponsor
              </a>
            </div>

            <div className="col-lg-6">
              <img
                src="/Employers%20supporting%20families.jpeg"
                alt="Employers supporting families"
                className="img-fluid rounded shadow-soft"
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="footer-ss py-4 border-top border-secondary-subtle text-center">
        <div className="container">
          <div className="mb-2">
            <img
              src="/logo-shiftsitter.png"
              alt="ShiftSitter"
              className="footer-logo me-2"
              style={{ height: "36px", verticalAlign: "middle" }}
            />
            <span className="fw-semibold">ShiftSitter</span>
          </div>

          <div className="mb-2 small">
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#privacyModal"
            >
              Privacy Policy
            </button>
            {" | "}
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#termsModal"
            >
              Terms &amp; Conditions
            </button>
            {" | "}
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none"
              data-bs-toggle="modal"
              data-bs-target="#contactModal"
            >
              Contact
            </button>
          </div>

          <div className="mb-2 footer-social">
            <a
              href="https://www.instagram.com/shiftsitterofficial?igsh=cm80MG83eDBtcjlw"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-instagram"></i>
            </a>
            <a
              href="https://x.com/ShiftSitterHQ"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-twitter-x"></i>
            </a>
            <a
              href="https://www.facebook.com/share/17kYbNJrEE/"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
            >
              <i className="bi bi-facebook"></i>
            </a>
            <a
              href="https://www.linkedin.com/company/shiftsitter/"
              target="_blank"
              rel="noreferrer"
              className="footer-icon"
              aria-label="LinkedIn"
            >
              <i className="bi bi-linkedin"></i>
            </a>
          </div>

          <div className="small">
            (c) {new Date().getFullYear()} ShiftSitter. All rights reserved.
          </div>
        </div>
      </footer>

      {/* OFFCANVAS + MODALS reales (Bootstrap JS ya cargado en layout) */}
      <div
        className="offcanvas offcanvas-end bg-offcanvas"
        tabIndex={-1}
        id="partnerDrawer"
        aria-labelledby="partnerDrawerLabel"
      >
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id="partnerDrawerLabel">
            Become a Sponsor
          </h5>
          <button
            type="button"
            className="btn-close"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          />
        </div>
        <div className="offcanvas-body">
          <p className="mb-0 text-muted-strong">
            Sponsor access for shift-working families. We&apos;ll share the
            options and next steps after launch.
          </p>
        </div>
      </div>

      <div
        className="modal fade"
        id="privacyModal"
        tabIndex={-1}
        aria-labelledby="privacyModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="privacyModalLabel">
                Privacy Policy
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="text-muted-strong mb-0">
                Privacy policy content goes here (paste your exact landing
                text).
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="modal fade"
        id="termsModal"
        tabIndex={-1}
        aria-labelledby="termsModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="termsModalLabel">
                Terms &amp; Conditions
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="text-muted-strong mb-0">
                Terms content goes here (paste your exact landing text).
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className="modal fade"
        id="contactModal"
        tabIndex={-1}
        aria-labelledby="contactModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="contactModalLabel">
                Contact
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <p className="text-muted-strong mb-2">
                Email us at{" "}
                <a className="contact-email" href="mailto:hello@shiftsitter.com">
                  hello@shiftsitter.com
                </a>
              </p>
              <p className="text-muted-strong mb-0">
                (If you want the exact landing contact form, pega aqui ese bloque
                y lo meto tal cual.)
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
