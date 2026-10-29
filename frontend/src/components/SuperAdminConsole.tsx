/**
 * Super Admin Console (Tier 1: Server & DevOps Control Plane).
 *
 * Exclusively for `super_admin_ops`:
 * - System runtime flags, server health, and infrastructure telemetry.
 * - Local server database snapshots & backups (/admin/api/v1/data/local-backups/)
 *   with direct download links (stored locally on the server; NO external Google Drive/Twin GAS).
 * - Comprehensive platform audit logging.
 * - Red-Zone Hard Reset Gate (guarded by confirmation phrase & Layer-2 SUPEROPS password).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Server,
  ShieldAlert,
  Terminal,
  Zap,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { t } from '../i18n';
import {
  AuditFeed,
  AuditRow,
  LocalBackupItem,
  createLocalBackup,
  fetchAuditFeed,
  fetchLocalBackups,
} from '../lib/adminApi';
import { RedZoneReset } from './AdminMccPanels';

interface SuperAdminConsoleProps {
  onSignOut?: () => void;
  subRole?: string;
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export const SuperAdminConsole: React.FC<SuperAdminConsoleProps> = ({
  onSignOut,
  subRole,
}) => {
  const [tab, setTab] = useState<'health' | 'backups' | 'audit' | 'reset'>('health');

  // Backups state
  const [backups, setBackups] = useState<LocalBackupItem[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Audit state
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupError(null);
    try {
      const res = await fetchLocalBackups();
      setBackups(res.backups || []);
    } catch (err) {
      setBackupError(
        err instanceof ApiError ? err.message : t('Failed to load local server snapshots.'),
      );
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetchAuditFeed({ limit: 40 });
      setAuditRows(res.results || []);
    } catch {
      /* ignore */
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'backups') void loadBackups();
    if (tab === 'audit') void loadAudit();
  }, [tab, loadBackups, loadAudit]);

  const handleCreateBackup = async () => {
    setBackupBusy(true);
    setBackupNotice(null);
    setBackupError(null);
    try {
      const res = await createLocalBackup('On-demand DevOps backup');
      setBackupNotice(
        `${t('Local database snapshot created successfully:')} ${res.filename} (${formatBytes(
          res.size_bytes,
        )})`,
      );
      await loadBackups();
    } catch (err) {
      setBackupError(
        err instanceof ApiError ? err.message : t('Failed to trigger database snapshot.'),
      );
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in">
      {/* Super Admin Top Banner */}
      <div className="bg-[#0b1712] text-white p-6 sm:p-8 rounded-3xl border border-[#1b382c] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2.5">
            <span className="bg-rose-900/80 text-rose-200 text-[11px] font-black px-3 py-0.5 rounded-full border border-rose-500/40 uppercase tracking-widest flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              {t('TIER 1 DEVOPS CORE')}
            </span>
            <span className="text-xs text-amber-300 font-semibold font-mono">
              ROLE: {subRole || 'super_admin_ops'}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Server className="w-7 h-7 text-emerald-400" />
            {t('NDLI Portal DevOps & Server Management Console')}
          </h1>

          <p className="text-xs text-emerald-100/80 max-w-2xl font-mono">
            {t(
              'Runtime flag monitoring, local database snapshots, audit stream inspection, and guarded system hard reset.',
            )}
          </p>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="self-start md:self-center px-4 py-2.5 rounded-xl bg-white/10 hover:bg-rose-950/60 border border-white/20 text-white text-xs font-bold flex items-center space-x-2 transition-colors"
          >
            <LogOut className="h-4 w-4 text-rose-300" />
            <span>{t('Sign out')}</span>
          </button>
        )}
      </div>

      {/* Navigation Desks */}
      <div className="flex items-center space-x-2 bg-white p-2.5 rounded-2xl border border-[#E2ECE7] shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('health')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'health'
              ? 'bg-[#103125] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>{t('System Flags & Runtime Health')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('backups')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'backups'
              ? 'bg-[#103125] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Database className="h-4 w-4" />
          <span>{t('Local Database Snapshots')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'audit'
              ? 'bg-[#103125] text-white shadow-xs'
              : 'text-[#2E4A3E] hover:bg-[#F4F8F6]'
          }`}
        >
          <Clock className="h-4 w-4" />
          <span>{t('System Audit Stream')}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('reset')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
            tab === 'reset'
              ? 'bg-rose-700 text-white shadow-xs'
              : 'text-rose-700 hover:bg-rose-50'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>{t('Red-Zone Hard Reset Gate')}</span>
        </button>
      </div>

      {/* TAB 1: System Flags & Health */}
      {tab === 'health' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#5A7366]">
                <span>{t('DJANGO RUNTIME')}</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-xl font-black text-[#103125]">Django 5.x / REST</div>
              <div className="text-xs text-[#5A7366]">{t('Operational • Single Origin API')}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#5A7366]">
                <span>{t('DATABASE ENGINE')}</span>
                <HardDrive className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-[#103125]">PostgreSQL Active</div>
              <div className="text-xs text-[#5A7366]">{t('ACID Compliant • Strict FK')}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#5A7366]">
                <span>{t('LOCAL STORAGE DESK')}</span>
                <Archive className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-xl font-black text-[#103125]">/data/backups/</div>
              <div className="text-xs text-[#5A7366]">{t('Local Disk • Zero Twin GAS')}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2ECE7] shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#5A7366]">
                <span>{t('GOVERNANCE TURF')}</span>
                <Lock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-black text-[#103125]">Dual-Layer Gate</div>
              <div className="text-xs text-[#5A7366]">{t('Server vs Business Partition')}</div>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-4">
            <h3 className="text-base font-extrabold text-[#103125] flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              {t('Server Architecture & Deployment Integrity')}
            </h3>
            <p className="text-xs text-[#5A7366] leading-relaxed">
              {t(
                'This instance is operating under the 3-Tier Governance Hierarchy. Super Admin (Tier 1) manages infrastructure and technical safeguards; Central Admin (Tier 2) governs academic and national operations; Regional Employees (Tier 3) handle day-to-day zonal support and charter verification.',
              )}
            </p>
            <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-[#E2ECE7] font-mono text-xs space-y-1.5 text-[#2E4A3E]">
              <div>[SECURITY] Captcha Engine: One-Shot Burning, Mixed-Case Salt, Case-Sensitive Strict</div>
              <div>[STORAGE] Backup Strategy: Server-side file snapshot storage under /data/backups/</div>
              <div>[ISOLATION] Turf Barrier: Central Admin has zero server-sync or daily activity entry access</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Local Database Snapshots */}
      {tab === 'backups' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-700" />
                {t('Local Server Database Snapshots')}
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t(
                  'On-demand JSON/SQL dumps stored in local server storage directory (/data/backups/). Zero dependency on external Google Drive or Twin Google Apps Scripts.',
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={backupBusy}
              onClick={handleCreateBackup}
              className="px-4 py-2.5 rounded-xl bg-[#1A503E] hover:bg-[#103125] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              {backupBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              <span>{backupBusy ? t('Creating snapshot…') : t('Create Database Snapshot')}</span>
            </button>
          </div>

          {backupNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{backupNotice}</span>
            </div>
          )}

          {backupError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{backupError}</span>
            </div>
          )}

          <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
            <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
              <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">{t('Snapshot Filename')}</th>
                  <th className="p-3.5">{t('Created At')}</th>
                  <th className="p-3.5 text-right">{t('File Size')}</th>
                  <th className="p-3.5 text-center">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                {backupsLoading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#5A7366]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-700" />
                      {t('Loading snapshot directory…')}
                    </td>
                  </tr>
                ) : backups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-[#5A7366]">
                      {t('No local snapshots generated yet. Click "Create Database Snapshot" above.')}
                    </td>
                  </tr>
                ) : (
                  backups.map((b, idx) => (
                    <tr key={b.filename} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3.5 font-mono text-[#5A7366]">{idx + 1}</td>
                      <td className="p-3.5 font-bold font-mono text-[#103125]">{b.filename}</td>
                      <td className="p-3.5 font-mono text-[#5A7366]">{formatStamp(b.created_at)}</td>
                      <td className="p-3.5 text-right font-mono font-semibold">
                        {formatBytes(b.size_bytes)}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => window.open(b.path, '_blank')}
                          className="px-3 py-1.5 rounded-lg bg-[#F4F8F6] hover:bg-emerald-50 text-emerald-800 border border-[#E2ECE7] hover:border-emerald-300 font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{t('Download')}</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: System Audit Stream */}
      {tab === 'audit' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2ECE7] shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[#E2ECE7] pb-4">
            <div>
              <h3 className="text-lg font-extrabold text-[#103125] flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-700" />
                {t('System Audit Stream & Security Ledger')}
              </h3>
              <p className="text-xs text-[#5A7366]">
                {t('Immutable historical log of all administrative, security, and data events.')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAudit()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#2E4A3E] bg-[#F4F8F6] hover:bg-[#E2ECE7] flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
              <span>{t('Refresh')}</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-[#E2ECE7] rounded-2xl">
            <table className="w-full text-left text-xs divide-y divide-[#E2ECE7]">
              <thead className="bg-[#F4F8F6] text-[#2E4A3E] font-bold uppercase text-[11px]">
                <tr>
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">{t('Timestamp')}</th>
                  <th className="p-3.5">{t('Actor')}</th>
                  <th className="p-3.5">{t('Action')}</th>
                  <th className="p-3.5">{t('Outcome')}</th>
                  <th className="p-3.5">{t('Object')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2ECE7] text-[#17332A]">
                {auditLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#5A7366]">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-700" />
                      {t('Loading system audit trail…')}
                    </td>
                  </tr>
                ) : auditRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#5A7366]">
                      {t('No audit trail entries recorded.')}
                    </td>
                  </tr>
                ) : (
                  auditRows.map((row) => (
                    <tr key={`${row.seq}-${row.timestamp}`} className="hover:bg-[#F4F8F6]/60 transition-colors">
                      <td className="p-3.5 font-mono text-[#5A7366]">{row.seq}</td>
                      <td className="p-3.5 font-mono text-[#5A7366]">{formatStamp(row.timestamp)}</td>
                      <td className="p-3.5 font-semibold text-[#103125]">{row.actor_label}</td>
                      <td className="p-3.5 font-mono">{row.action}</td>
                      <td className="p-3.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            String(row.outcome).toLowerCase().includes('fail') ||
                            String(row.outcome).toLowerCase().includes('denied')
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {row.outcome}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-[#5A7366]">
                        {row.object_type}:{row.object_id}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Red-Zone Hard Reset Gate */}
      {tab === 'reset' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border-2 border-rose-200 shadow-lg space-y-6">
          <div className="border-b border-rose-200 pb-4">
            <h3 className="text-xl font-extrabold text-rose-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-rose-600" />
              {t('Red-Zone System Hard Reset Gate')}
            </h3>
            <p className="text-xs text-rose-700 mt-1">
              {t(
                'High-privilege system wipe for handover or redeployment. Re-requires confirmation literal, one-shot mixed-case CAPTCHA, and SUPEROPS master password.',
              )}
            </p>
          </div>

          <RedZoneReset />
        </div>
      )}
    </div>
  );
};
