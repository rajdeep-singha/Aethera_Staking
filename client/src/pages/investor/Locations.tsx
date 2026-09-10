import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Locations.css";

// VITE_API_URL may hold a comma-separated list (e.g. "local,prod"); use the first.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000/api")
  .split(",")[0]
  .trim();

interface LocationData {
  id: number;
  name: string;
  lat: number;
  lng: number;
  dni: number;
  ghi: number;
  lat_tilt: number;
  potential: string;
  updated_at: string;
}

// Fetch locations from backend API
async function fetchOracleLocations(): Promise<LocationData[]> {
  try {
    const resourceUrl = `${API_BASE_URL}/project/locations`;
    console.log(`[fetchOracleLocations] Fetching from: ${resourceUrl}`);
    
    const res = await fetch(resourceUrl);
    
    if (!res.ok) {
      console.error(`[fetchOracleLocations] Failed with status ${res.status}: ${res.statusText}`);
      console.error(`[fetchOracleLocations] Response:`, await res.text());
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    console.log(`[fetchOracleLocations] Data fetched successfully`, json);
    
    const locations = json?.data || [];
    return locations.map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      dni: loc.dni,
      ghi: loc.ghi,
      lat_tilt: loc.lat_tilt,
      potential: loc.potential || "Good",
      updated_at: loc.updated_at,
    }));
  } catch (e) {
    console.error("[fetchOracleLocations] Error:", e);
    // Fallback to hardcoded values
    return [
      { id: 1, name: "San Francisco, CA", lat: 37.7749, lng: -122.4194, dni: 4.05, ghi: 4.34, lat_tilt: 4.96, potential: "Good",      updated_at: "08/03/2026, 21:25:07" },
      { id: 2, name: "New York City, NY", lat: 40.7128, lng: -74.006,  dni: 3.79, ghi: 3.93, lat_tilt: 4.62, potential: "Fair",      updated_at: "08/03/2026, 21:25:14" },
      { id: 3, name: "Phoenix, AZ",       lat: 33.4484, lng: -112.074, dni: 7.35, ghi: 5.78, lat_tilt: 6.68, potential: "Excellent", updated_at: "08/03/2026, 21:25:20" },
    ];
  }
}

const potentialColor = (p: string) => {
  if (p === "Excellent") return "#f59e0b";
  if (p === "Good")      return "#4ade80";
  return "#94a3b8";
};

export default function Locations() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = async () => {
    setLoading(true);
    const data = await fetchOracleLocations();
    setLocations(data);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const avgDni = locations.length ? (locations.reduce((a, l) => a + l.dni, 0) / locations.length).toFixed(2) : "—";
  const avgGhi = locations.length ? (locations.reduce((a, l) => a + l.ghi, 0) / locations.length).toFixed(2) : "—";

  return (
    <div className="locations-page">
      {/* Header */}
      <header className="oracle-header">
        <div className="oracle-brand">
          <span className="oracle-logo">☀️</span>
          <div>
            <span className="oracle-title">Solar Oracle</span>
            <span className="oracle-sub">Real-time solar irradiance data on Aptos</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="back-btn" onClick={() => navigate("/")}>← Home</button>
          <div className="network-chip">testnet</div>
          <button className="refresh-btn" onClick={load} disabled={loading}>
            {loading ? "..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      <div className="locations-content">
        {/* Stats row */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-icon">📍</span>
            <span className="stat-label">Total Locations</span>
            <span className="stat-value">{locations.length}</span>
            <span className="stat-sub">on-chain</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⚡</span>
            <span className="stat-label">Avg DNI</span>
            <span className="stat-value">{avgDni}</span>
            <span className="stat-sub">kWh/m²/day</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">☀️</span>
            <span className="stat-label">Avg GHI</span>
            <span className="stat-value">{avgGhi}</span>
            <span className="stat-sub">kWh/m²/day</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🕒</span>
            <span className="stat-label">Total Updates</span>
            <span className="stat-value">{locations.length}</span>
            <span className="stat-sub">{lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Location cards */}
        {loading ? (
          <div className="loading-state">Loading oracle data from Aptos...</div>
        ) : (
          <div className="location-grid">
            {locations.map((loc) => (
              <div key={loc.id} className="location-card">
                <div className="loc-header">
                  <div>
                    <h3>{loc.name}</h3>
                    <span className="loc-coords">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>
                  </div>
                  <span className="sun-icon">☀️</span>
                </div>

                <div className="loc-metrics">
                  <div className="metric-row">
                    <span className="metric-label">DNI</span>
                    <span className="metric-value">{loc.dni} <small>kWh/m²/day</small></span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">GHI</span>
                    <span className="metric-value">{loc.ghi} <small>kWh/m²/day</small></span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-label">Lat Tilt</span>
                    <span className="metric-value">{loc.lat_tilt} <small>kWh/m²/day</small></span>
                  </div>
                </div>

                <div className="loc-footer">
                  <div className="potential-row">
                    <span className="potential-label">Solar Potential</span>
                    <span className="potential-value" style={{ color: potentialColor(loc.potential) }}>
                      {loc.potential}
                    </span>
                  </div>
                  <span className="updated-at">Updated: {loc.updated_at}</span>
                </div>

                {/* KEY: View Projects button */}
                <button
                  className="view-projects-btn"
                  onClick={() => navigate(`/invest/location/${loc.id}`)}
                >
                  View Projects →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Oracle info footer */}
        <div className="oracle-footer">
          <div>
            <span className="footer-label">Data Source</span>
            <span className="footer-value">Aethera Backend API</span>
            <a
              href="http://localhost:3000/health"
              target="_blank"
              rel="noreferrer"
              className="explorer-link"
            >
              ↗ API Health Check
            </a>
          </div>
          <div>
            <span className="footer-label">Network</span>
            <span className="footer-value" style={{ color: "#4ade80" }}>testnet</span>
            <span className="footer-sub">Oracle data managed by Aethera API</span>
          </div>
        </div>
      </div>
    </div>
  );
}