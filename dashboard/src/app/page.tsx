'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ShieldAlert, Navigation, Trash2, Activity, Play, CheckCircle2 } from 'lucide-react';

// Dynamically import map component to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

export default function Dashboard() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/state');
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch (err) {
      console.error('Failed to fetch state:', err);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:8000/api/supervisor/run', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      await fetchState();
    } catch (err: any) {
      setError(err.message || 'Failed to run analysis');
    } finally {
      setLoading(false);
    }
  };

  const s = state || {};
  const sentinel = s.sentinel || {};
  const nav = s.navigator?.route_result || {};
  const cleaner = s.cleaner || {};
  const supervisor = s.supervisor?.last_decision || {};

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <Activity className="text-blue-400" size={32} />
          <h1>MARINEX</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400">
            {s.last_updated ? `Last updated: ${new Date(s.last_updated).toLocaleTimeString()}` : 'Ready'}
          </div>
          <button 
            onClick={runAnalysis} 
            disabled={loading}
            className="run-btn"
          >
            {loading ? <Activity className="animate-spin" size={20} /> : <Play size={20} />}
            {loading ? 'Analyzing...' : 'Run Full Analysis'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="dashboard-grid">
        {/* Map Panel (Spans both columns) */}
        <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <span className="text-xl">🗺️</span>
              <h2 className="panel-title">Unified Scenario View</h2>
            </div>
          </div>
          <div className="map-container">
            <MapComponent state={state} />
          </div>
        </div>

        {/* SENTINEL Panel */}
        <div className="glass-card">
          <div className="panel-header">
            <ShieldAlert className="text-red-400" size={24} />
            <h2 className="panel-title">SENTINEL (Risk Detection)</h2>
          </div>
          <div className="stat-grid">
            <div className="stat-box">
              <div className="stat-label">Vessels Assessed</div>
              <div className="stat-value">{sentinel.cases?.length || 0}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Risk Zones Generated</div>
              <div className="stat-value">{sentinel.risk_zones?.length || 0}</div>
            </div>
          </div>
          {sentinel.cases?.[0] && (
            <div className="mt-4 p-4 bg-black/40 rounded-lg border border-red-500/20 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_10px_#ef4444]"></div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-lg">{sentinel.cases[0].name}</h3>
                <span className={`badge ${sentinel.cases[0].risk_level.toLowerCase()} ${sentinel.cases[0].risk_level === 'CRITICAL' ? 'pulse-alert' : ''}`}>
                  {sentinel.cases[0].risk_level}
                </span>
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Risk Score</span>
                  <span className="text-red-400 font-bold">{sentinel.cases[0].risk_score}/100</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${sentinel.cases[0].risk_score}%` }}></div>
                </div>
              </div>

              <div className="text-xs text-slate-300 bg-slate-900/50 p-2 rounded border border-white/5">
                {sentinel.cases[0].evidence?.slice(0, 2).map((ev: any, i: number) => (
                  <div key={i} className="mb-1 flex gap-2">
                    <span className="text-red-400">▹</span>
                    <span>{ev.explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* NAVIGATOR Panel */}
        <div className="glass-card">
          <div className="panel-header">
            <Navigation className="text-blue-400" size={24} />
            <h2 className="panel-title">NAVIGATOR (Route Optimization)</h2>
          </div>
          {nav.comparison ? (
            <>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-label">Baseline Distance</div>
                  <div className="stat-value">{nav.comparison.baseline_distance_km} <span className="text-sm font-normal text-slate-400">km</span></div>
                </div>
                <div className="stat-box border-blue-500/30 bg-blue-500/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 blur-xl rounded-full"></div>
                  <div className="stat-label text-blue-300">Optimized Distance</div>
                  <div className="stat-value text-blue-400 glow-text-blue">
                    {nav.comparison.optimized_distance_km} <span className="text-sm font-normal text-blue-300">km</span>
                    <span className="text-xs text-slate-400 ml-2">({nav.comparison.distance_delta_pct > 0 ? '+' : ''}{nav.comparison.distance_delta_pct}%)</span>
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Baseline ETA</div>
                  <div className="stat-value">{nav.comparison.baseline_eta_hours} <span className="text-sm font-normal text-slate-400">h</span></div>
                </div>
                <div className="stat-box border-blue-500/30 bg-blue-500/5">
                  <div className="stat-label text-blue-300">Optimized ETA</div>
                  <div className="stat-value text-blue-400 glow-text-blue">
                    {nav.comparison.optimized_eta_hours} <span className="text-sm font-normal text-blue-300">h</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200 flex items-center justify-between">
                <span>Security Exposure:</span>
                <span className="flex items-center gap-2">
                  <span className="text-red-400 line-through opacity-70">{nav.comparison.baseline_security_exposure}</span>
                  <span>→</span>
                  <span className="text-emerald-400 font-bold drop-shadow-[0_0_5px_#34d399]">{nav.comparison.optimized_security_exposure}</span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-slate-500 italic mt-4">Run analysis to compute routes.</div>
          )}
        </div>

        {/* CLEANER Panel */}
        <div className="glass-card">
          <div className="panel-header">
            <Trash2 className="text-emerald-400" size={24} />
            <h2 className="panel-title">CLEANER (Debris Response)</h2>
          </div>
          {cleaner.cleanup_plan ? (
            <>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-label">Clusters Found</div>
                  <div className="stat-value">{cleaner.clusters?.length || 0}</div>
                </div>
                <div className="stat-box border-emerald-500/30 bg-emerald-500/5">
                  <div className="stat-label text-emerald-300">USV Assignments</div>
                  <div className="stat-value text-emerald-400 glow-text-green">{cleaner.cleanup_plan.assignments?.length || 0}</div>
                </div>
                <div className="stat-box border-emerald-500/30 bg-emerald-500/5">
                  <div className="stat-label text-emerald-300">Est. Collection</div>
                  <div className="stat-value text-emerald-400 glow-text-green">{cleaner.cleanup_plan.estimated_collection_kg} <span className="text-sm font-normal text-emerald-300">kg</span></div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Completion Time</div>
                  <div className="stat-value">{cleaner.cleanup_plan.completion_time_hours} <span className="text-sm font-normal text-slate-400">h</span></div>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Fleet Capacity Utilization</span>
                  <span className="text-emerald-400 font-bold">{(cleaner.cleanup_plan.capacity_utilization * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, cleaner.cleanup_plan.capacity_utilization * 100)}%` }}></div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-slate-500 italic mt-4">Run analysis to plan cleanup missions.</div>
          )}
        </div>

        {/* SUPERVISOR Panel */}
        <div className="glass-card">
          <div className="panel-header">
            <CheckCircle2 className="text-cyan-400" size={24} />
            <h2 className="panel-title">SUPERVISOR (Orchestration)</h2>
          </div>
          {supervisor.trace ? (
            <>
              <div className="mb-4">
                <div className="text-sm font-semibold mb-2 text-slate-300 uppercase tracking-wider">Recommendation</div>
                <div className="text-sm text-cyan-100 bg-cyan-900/20 p-3 rounded-lg border border-cyan-500/30 shadow-[inset_0_0_15px_rgba(6,182,212,0.1)]">
                  {supervisor.recommendation}
                </div>
              </div>
              
              <div className="text-sm font-semibold mb-2 text-slate-300 uppercase tracking-wider flex justify-between">
                <span>Execution Trace</span>
                <span className="text-cyan-400 font-normal">{(supervisor.confidence * 100).toFixed(0)}% Confidence</span>
              </div>
              <div className="trace-list">
                {supervisor.trace.map((step: any, idx: number) => (
                  <div key={idx} className="trace-item border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-900/10 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <div className="trace-agent drop-shadow-[0_0_5px_#06b6d4]">{step.agent}</div>
                      <div className="text-xs text-slate-500">{step.duration_ms}ms</div>
                    </div>
                    <div className="text-slate-300 font-mono text-xs opacity-80">{step.tool}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-slate-500 italic mt-4">Awaiting execution trace...</div>
          )}
        </div>
      </div>
    </div>
  );
}
