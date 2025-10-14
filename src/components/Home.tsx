import "./home.css";

export default function Home() {
  return (
    <section className="home">
      <header className="home-header">
        <h2>Today</h2>
        <p>Priorities and upcoming events</p>
      </header>

      <div className="home-grid">
        <div className="card focus">
          <h3>Focus Task</h3>
          <p>Prepare slide deck for 3pm meeting</p>
          <div className="meta-row">
            <span className="badge">Due 14:30</span>
            <span className="badge gray">45 min</span>
          </div>
        </div>

        <div className="card event">
          <h3>Next Event</h3>
          <p>Weekly sync with product team</p>
          <div className="meta-row">
            <span className="badge green">15:00 • GCal</span>
          </div>
        </div>

        <div className="card todo">
          <h3>Quick Wins</h3>
          <ul className="list">
            <li><input type="checkbox" /> Reply to Alex (Gmail)</li>
            <li><input type="checkbox" /> Confirm dinner (WhatsApp)</li>
            <li><input type="checkbox" /> Book train tickets</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

