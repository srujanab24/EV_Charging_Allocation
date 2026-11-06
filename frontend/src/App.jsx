import { useState } from "react";
import {
  LayoutDashboard, CalendarDays, Clock3, MapPin,
  Users, Activity, Settings, CircleHelp, Zap,
  ChevronDown, ArrowRight, ArrowUpRight,
  Search, Bell, Menu, PlugZap, Gauge,
  ShieldCheck, CreditCard, Command
} from "lucide-react";
import "./App.css";

const menuGroups = [
  {
    label: "WORKSPACE",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Book a Charger", icon: CalendarDays },
      { name: "My Bookings", icon: Clock3 },
      { name: "Charging Stations", icon: MapPin },
      { name: "Waiting Queue", icon: Users },
    ],
  },
  {
    label: "INSIGHTS",
    items: [{ name: "Analytics", icon: Activity }],
  },
];

const metrics = [
  { label: "Total charging stations", icon: PlugZap, tone: "mint", detail: "Live data unavailable" },
  { label: "My bookings", icon: CalendarDays, tone: "blue", detail: "Your reservations" },
  { label: "Waiting requests", icon: Clock3, tone: "amber", detail: "Requests in queue" },
  { label: "Energy delivered", icon: Gauge, tone: "violet", detail: "Charging activity" },
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (page) => {
    setActivePage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Zap size={19} /></div>
          <div className="brand-copy">
            <strong>volt<span>grid</span></strong>
            <small>CHARGING NETWORK</small>
          </div>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">EV</div>
          <div className="workspace-copy">
            <span>Workspace</span>
            <strong>EV Operations</strong>
          </div>
          <ChevronDown size={15} />
        </div>

        <nav className="side-navigation">
          {menuGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  className={`nav-link ${activePage === name ? "selected" : ""}`}
                  onClick={() => navigate(name)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-tools">
          <button className="nav-link" onClick={() => navigate("Settings")}>
            <Settings size={17} /> Settings
          </button>
          <button className="nav-link" onClick={() => navigate("Help & Support")}>
            <CircleHelp size={17} /> Help & Support
          </button>
        </div>

        <div className="sidebar-account">
          <div className="account-avatar">U</div>
          <div className="account-copy">
            <strong>EV User</strong>
            <span>Customer account</span>
          </div>
          <ChevronDown size={15} />
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="mobile-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{activePage}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="system-status">
              <span className="status-indicator" />
              Frontend running
            </div>
            <Search size={18} />
            <Bell size={18} />
            <div className="topbar-divider" />
            <div className="account-avatar small">U</div>
          </div>
        </header>

        <div className="page-content">
          {activePage === "Dashboard" ? (
            <>
              <section className="page-heading">
                <div>
                  <p className="overline">OVERVIEW</p>
                  <h1>Charging overview<span className="heading-period">.</span></h1>
                  <p className="page-subtitle">
                    Manage your charging activity from one place.
                  </p>
                </div>
                <span className="date-filter">
                  <CalendarDays size={16} /> Overview
                </span>
              </section>

              <section className="hero-panel">
                <div className="hero-content">
                  <span className="hero-kicker">EV CHARGING, SIMPLIFIED</span>
                  <h2>Power your next<br />journey with confidence.</h2>
                  <p>
                    Find a compatible charging point and reserve
                    your time in just a few steps.
                  </p>
                  <button className="hero-button" onClick={() => navigate("Book a Charger")}>
                    Book a charging point <ArrowRight size={16} />
                  </button>
                </div>
                <div className="hero-visual">
                  <div className="visual-orbit orbit-one" />
                  <div className="visual-orbit orbit-two" />
                  <div className="visual-core"><Zap size={48} strokeWidth={1.3} /></div>
                </div>
              </section>

              <section className="section-block">
                <div className="section-title-row">
                  <div>
                    <h2>At a glance</h2>
                    <p>Key metrics from your account</p>
                  </div>
                  <span className="data-note">
                    <ShieldCheck size={14} /> Awaiting backend connection
                  </span>
                </div>

                <div className="metrics-grid">
                  {metrics.map(({ label, icon: Icon, tone, detail }) => (
                    <article className="metric-card" key={label}>
                      <div className="metric-top">
                        <div className={`metric-icon ${tone}`}>
                          <Icon size={18} strokeWidth={1.8} />
                        </div>
                        <span className="metric-menu">•••</span>
                      </div>
                      <p className="metric-label">{label}</p>
                      <strong className="metric-value">—</strong>
                      <span className="metric-footnote">{detail}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="dashboard-grid">
                <article className="surface-card activity-card">
                  <div className="card-heading">
                    <div>
                      <h2>Charging activity</h2>
                      <p>Energy consumption over time</p>
                    </div>
                    <span className="select-control">Weekly <ChevronDown size={14} /></span>
                  </div>

                  <div className="chart-legend">
                    <span><i /> Energy delivered</span>
                    <small>Illustrative chart</small>
                  </div>

                  <div className="chart-placeholder">
                    <div className="chart-y-labels">
                      <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
                    </div>
                    <div className="chart-area">
                      <div className="chart-grid-lines">
                        <i /><i /><i /><i /><i />
                      </div>
                      <svg viewBox="0 0 700 190" preserveAspectRatio="none" aria-label="Illustrative charging activity chart">
                        <defs>
                          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#159b70" stopOpacity=".18" />
                            <stop offset="100%" stopColor="#159b70" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 145 C55 130 70 150 115 112 S185 122 230 94 S300 110 350 76 S420 98 465 66 S535 90 585 43 S650 61 700 24 L700 190 L0 190 Z"
                          fill="url(#chartFill)"
                        />
                        <path
                          d="M0 145 C55 130 70 150 115 112 S185 122 230 94 S300 110 350 76 S420 98 465 66 S535 90 585 43 S650 61 700 24"
                          fill="none"
                          stroke="#159b70"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="chart-x-labels">
                        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => (
                          <span key={day}>{day}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="chart-empty-note">
                    Sample visualization. Actual data will appear after API integration.
                  </div>
                </article>

                <article className="surface-card station-card">
                  <div className="card-heading">
                    <div>
                      <h2>Station availability</h2>
                      <p>Charging network status</p>
                    </div>
                    <button className="subtle-icon-button" onClick={() => navigate("Charging Stations")}>
                      <ArrowUpRight size={17} />
                    </button>
                  </div>

                  <div className="station-summary">
                    <div className="station-ring">
                      <div><strong>—</strong><span>stations</span></div>
                    </div>
                    <div className="station-legend">
                      <div><i className="legend-available" /><span>Available</span><strong>—</strong></div>
                      <div><i className="legend-occupied" /><span>Occupied</span><strong>—</strong></div>
                      <div><i className="legend-offline" /><span>Offline</span><strong>—</strong></div>
                    </div>
                  </div>
                  <div className="station-footer">Station data not connected</div>
                </article>
              </section>

              <section className="surface-card bookings-card">
                <div className="card-heading">
                  <div>
                    <h2>Recent bookings</h2>
                    <p>Keep track of your latest reservations</p>
                  </div>
                  <button className="link-button" onClick={() => navigate("My Bookings")}>
                    View all bookings <ArrowRight size={15} />
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>BOOKING</th>
                        <th>CHARGING STATION</th>
                        <th>DATE & TIME</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan="4">
                          <div className="table-empty">
                            <div className="table-empty-icon"><CreditCard size={19} /></div>
                            <strong>No bookings to display</strong>
                            <span>Your reservations will appear here once you make a booking.</span>
                            <button onClick={() => navigate("Book a Charger")}>
                              Create your first booking <ArrowRight size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <section className="placeholder-page surface-card">
              <div className="placeholder-icon"><Command size={24} /></div>
              <p className="overline">WORKSPACE</p>
              <h1>{activePage}</h1>
              <p>This section is ready for the next development step.</p>
              <button className="hero-button" onClick={() => navigate("Dashboard")}>
                Return to overview <ArrowRight size={16} />
              </button>
            </section>
          )}

          <footer className="page-footer">
            <span>VOLTGRID · EV CHARGING MANAGEMENT</span>
            <span>Designed for smarter mobility</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;