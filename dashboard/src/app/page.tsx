'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ShieldAlert, Navigation, Trash2, Activity, Play, CheckCircle2 } from 'lucide-react';
import { DEMO_DASHBOARD_STATE } from '@/lib/demo-state';
import { fetchDashboardState, runSupervisorAnalysis, type DataSource } from '@/lib/api';
import type { DashboardState } from '@/lib/types';

// Dynamically import map component to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>(DEMO_DASHBOARD_STATE);
  const [dataSource, setDataSource] = useState<DataSource>('offline-demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDashboardState().then((result) => {
      if (!cancelled) {
        setState(result.state);
        setDataSource(result.source);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runSupervisorAnalysis();
      setState(result.state);
      setDataSource(result.source);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run analysis');
    } finally {
      setLoading(false);
    }
  };

  const s = state;
  const sentinel = s.sentinel;
  const nav = s.navigator.route_result;
  const cleaner = s.cleaner;
  const supervisor = s.supervisor.last_decision;

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
          <div className={`badge ${dataSource === 'api' ? 'low' : 'medium'}`}>
            {dataSource === 'api' ? 'LIVE API' : 'OFFLINE DEMO'}
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
                {sentinel.cases[0].evidence.slice(0, 2).map((ev, i) => (
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
          {nav ? (
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
                <div className="w-full bg-slate-800 rounded-full h-2 mb-4">
                  <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, cleaner.cleanup_plan.capacity_utilization * 100)}%` }}></div>
                </div>
                
                {cleaner.cleanup_plan.assignments && cleaner.cleanup_plan.assignments.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Assignments & Alternatives</div>
                    {cleaner.cleanup_plan.assignments.map((assignment: unknown, idx: number) => {
                      const asgn = assignment as {
                        usv_id: string;
                        cluster_id: string;
                        mission_score: number;
                        travel_distance_km: number;
                        alternatives?: Array<{ selected: boolean; rejection_reasons?: string[]; usv_id: string }>;
                      };
                      const rejectedAlt = asgn.alternatives?.find((a) => !a.selected && a.rejection_reasons && a.rejection_reasons.length > 0);
                      
                      return (
                        <div key={idx} className="bg-black/40 border border-emerald-500/20 p-3 rounded-lg text-sm">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-emerald-300">{asgn.usv_id} → {asgn.cluster_id}</span>
                            <span className="badge medium glow-text-green text-xs">SELECTED</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-2">
                            <div>Score: <span className="text-slate-200">{asgn.mission_score?.toFixed(2) || 'N/A'}</span></div>
                            <div>Dist: <span className="text-slate-200">{asgn.travel_distance_km} km</span></div>
                          </div>
                          {rejectedAlt && (
                            <div className="mt-2 pt-2 border-t border-white/5 text-xs">
                              <span className="text-slate-500">Rejected alternative: </span>
                              <span className="text-slate-400">{rejectedAlt.usv_id} </span>
                              <span className="text-red-400/80">({rejectedAlt.rejection_reasons?.[0]})</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
          {supervisor ? (
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
                {supervisor.trace.map((step) => (
                  <div key={step.step} className="trace-item border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-900/10 transition-colors">
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
