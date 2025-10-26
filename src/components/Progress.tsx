import "./progress.css";

export default function Progress() {
  return (
    <section className="progress">
      <header className="progress__header">
        <span className="eyebrow">Orbital insights</span>
        <h2>Stay in sync with ORA&apos;s rituals</h2>
        <p>
          ORA measures your schedule flow, highlights focus time, and surfaces the next actions to keep momentum on
          track.
        </p>
      </header>

      <div className="progress__grid">
        <div className="card progress__summary">
          <div className="progress__summary-head">
            <span className="eyebrow">Flow score</span>
            <h3>Balance between meetings and focus</h3>
            <p>Connect your calendar to unlock live insights.</p>
          </div>
          <div className="progress__empty">
            <p>Link a calendar to let ORA track rituals, focus time, and upcoming milestones.</p>
            <button className="btn btn-primary" type="button" disabled>
              Connect a service
            </button>
          </div>
        </div>

        <div className="card progress__timeline">
          <div className="progress__timeline-head">
            <div>
              <span className="eyebrow">Next orbit</span>
              <h3>Load across the next six days</h3>
            </div>
            <span className="progress__timeline-total">0 events</span>
          </div>
          <p className="progress__empty">
            Timeline insights appear once a calendar is connected. All systems are ready whenever you are.
          </p>
        </div>

        <div className="card progress__upcoming">
          <div className="progress__upcoming-head">
            <span className="eyebrow">Next highlights</span>
            <h3>Milestones on your radar</h3>
          </div>
          <p className="progress__empty">
            No milestones scheduled yet. Drop an idea into ORA to get started or connect your calendar.
          </p>
        </div>
      </div>
    </section>
  );
}

