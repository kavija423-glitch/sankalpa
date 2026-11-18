import React, { useRef, useState } from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { DEFAULT_FIREBASE_CONFIG_JSON } from '../data/firebaseDefaultConfig';
import type { AppSettings, ExamCountdown, SubjectConfig, SubjectKey } from '../types/app';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  subjects: Record<SubjectKey, SubjectConfig>;
  examCountdowns: ExamCountdown[];
  firebaseUser: User | null;
  firebaseProjectId: string | null;
  syncStatus: 'offline_local' | 'connected' | 'syncing' | 'error';
  syncError: string | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateSubjectColor: (subject: SubjectKey, color: string) => void;
  onAddExamCountdown: (exam: Omit<ExamCountdown, 'id'>) => void;
  onDeleteExamCountdown: (id: string) => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
  onResetAllData: () => void;
  onConnectFirebase: (configJson: string) => Promise<void>;
  onDisconnectFirebase: () => Promise<void>;
  onSignInGoogle: () => Promise<void>;
  onSignInEmail: (email: string, password: string, isSignUp: boolean) => Promise<void>;
  onSignOutFirebase: () => Promise<void>;
  onForceSyncNow: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  subjects,
  examCountdowns,
  firebaseUser,
  firebaseProjectId,
  syncStatus,
  syncError,
  onUpdateSettings,
  onUpdateSubjectColor,
  onAddExamCountdown,
  onDeleteExamCountdown,
  onExportJson,
  onImportJson,
  onResetAllData,
  onConnectFirebase,
  onDisconnectFirebase,
  onSignInGoogle,
  onSignInEmail,
  onSignOutFirebase,
  onForceSyncNow,
}) => {
  const [configDraft, setConfigDraft] = useState(settings.firebaseConfigJson);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamDate, setNewExamDate] = useState('2027-08-05');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      onImportJson(text);
      setStatusMessage('Backup JSON imported and merged cleanly.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to import JSON backup.');
    } finally {
      e.target.value = '';
    }
  };

  const handleConnect = async () => {
    setStatusMessage(null);
    try {
      await onConnectFirebase(configDraft);
      setStatusMessage('Firebase app initialized with offline persistence.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Invalid Firebase JSON config.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      await onSignInEmail(email, password, authMode === 'signup');
      setEmail('');
      setPassword('');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-5 space-y-6">
      <div className="border-b border-[#E5E5E0] dark:border-[#232834] pb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6]">
            Workspace Settings
          </h1>
          <p className="text-sm text-[#5A5A55] dark:text-[#9CA3AF] mt-1">
            Appearance, subject palette, exam countdowns, JSON backups & optional Firebase sync
          </p>
        </div>
        <PWAInstallButton variant="compact" />
      </div>

      {/* Theme & Study Goal */}
      <section className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-5">
        <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
          Appearance & Goals
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-medium text-[#5A5A55] dark:text-[#9CA3AF] mb-2">
              Theme
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834]">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  settings.theme === 'light'
                    ? 'bg-white text-[#141413] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  settings.theme === 'dark'
                    ? 'bg-[#1F2430] text-[#F3F4F6] shadow-xs'
                    : 'text-[#5A5A55] dark:text-[#9CA3AF]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="daily-goal-mins"
              className="block text-xs font-medium text-[#5A5A55] dark:text-[#9CA3AF] mb-2"
            >
              Daily Study Target (minutes)
            </label>
            <input
              id="daily-goal-mins"
              type="number"
              min={30}
              max={960}
              step={15}
              value={settings.dailyGoalMinutes}
              onChange={(e) =>
                onUpdateSettings({ dailyGoalMinutes: Math.max(30, Number(e.target.value) || 240) })
              }
              className="w-full rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3.5 py-2.5 text-sm font-mono tabular-nums text-[#141413] dark:text-[#F3F4F6]"
            />
          </div>
        </div>

        {/* Custom Subject Colors */}
        <div className="pt-3 border-t border-[#E5E5E0] dark:border-[#232834]">
          <span className="block text-xs font-medium text-[#5A5A55] dark:text-[#9CA3AF] mb-3">
            Subject Accent Colors
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.values(subjects).map((sub) => (
              <label
                key={sub.id}
                className="flex items-center justify-between rounded-xl border border-[#E5E5E0] dark:border-[#232834] px-3.5 py-2.5 cursor-pointer"
              >
                <span className="text-xs font-medium text-[#141413] dark:text-[#F3F4F6]">
                  {sub.label}
                </span>
                <input
                  type="color"
                  value={sub.color}
                  onChange={(e) => onUpdateSubjectColor(sub.id, e.target.value)}
                  aria-label={`Color for ${sub.label}`}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Exam Countdowns */}
      <section className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4">
        <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
          Exam Countdowns
        </h2>
        <div className="space-y-2">
          {examCountdowns.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded-xl border border-[#E5E5E0] dark:border-[#232834] px-3.5 py-2.5"
            >
              <div>
                <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6]">{ex.title}</div>
                <div className="text-[11px] font-mono tabular-nums text-[#5A5A55] dark:text-[#9CA3AF]">{ex.date}</div>
              </div>
              <button
                type="button"
                onClick={() => onDeleteExamCountdown(ex.id)}
                aria-label={`Delete countdown ${ex.title}`}
                className="p-1.5 rounded-lg text-[#5A5A55] hover:text-red-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newExamTitle.trim()) return;
            onAddExamCountdown({
              title: newExamTitle.trim(),
              date: newExamDate,
              subject: 'general',
            });
            setNewExamTitle('');
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={newExamTitle}
            onChange={(e) => setNewExamTitle(e.target.value)}
            placeholder="Exam name (e.g., Term Test / A/L Final)"
            aria-label="New exam countdown title"
            className="flex-1 rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={newExamDate}
            onChange={(e) => setNewExamDate(e.target.value)}
            aria-label="New exam countdown date"
            className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#141413] dark:bg-[#F3F4F6] text-white dark:text-[#141413] text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>
      </section>

      {/* Local JSON Backups */}
      <section className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
          Manual JSON Backups
        </h2>
        <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">
          All data is saved immediately to your browser’s localStorage for 100% offline use. Export a JSON snapshot anytime.
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={onExportJson}
            className="px-4 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export JSON Backup</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import JSON Backup</span>
          </button>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset Workspace Data</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetAllData();
                  setConfirmReset(false);
                  setStatusMessage('Workspace reset to a clean empty state.');
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>
      </section>

      {/* Built-in Real-Time Firebase Cloud Sync */}
      <section className="rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-[#141413] dark:text-[#F3F4F6]">
              Cloud Firestore Sync
            </h2>
            <p className="text-xs text-[#5A5A55] dark:text-[#9CA3AF] mt-0.5">
              Built-in real-time sync across devices with offline persistence & persistent sign-in.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {firebaseUser && (syncStatus === 'connected' || syncStatus === 'syncing') ? (
              <>
                <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-400">
                  {syncStatus === 'syncing' ? 'Syncing...' : `Synced (${firebaseProjectId})`}
                </span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 text-[#9CA3AF]" />
                <span className="text-[#5A5A55] dark:text-[#9CA3AF]">
                  {firebaseProjectId ? `Sign in to sync (${firebaseProjectId})` : 'Local-only mode'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Auth Section (Available immediately via built-in Firebase config) */}
        {firebaseProjectId && (
          <div className="space-y-4">
            {firebaseUser ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] p-3.5">
                <div>
                  <div className="text-xs font-semibold text-[#141413] dark:text-[#F3F4F6]">
                    Signed in as {firebaseUser.email || firebaseUser.displayName || firebaseUser.uid}
                  </div>
                  <div className="text-[11px] text-[#5A5A55] dark:text-[#9CA3AF]">
                    Real-time Cloud Firestore listener active · Session stays signed in across reloads
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onForceSyncNow()}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Sync Now
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSignOutFirebase()}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onSignInGoogle()}
                    className="px-4 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-xs font-semibold text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                  >
                    Continue with Google
                  </button>
                  <span className="text-xs text-[#5A5A55] dark:text-[#9CA3AF]">or use Email & Password:</span>
                </div>

                <form onSubmit={(e) => void handleEmailAuth(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    aria-label="Firebase account email"
                    className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    aria-label="Firebase account password"
                    className="rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3 py-2 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-3 py-2 rounded-xl bg-[#141413] dark:bg-[#F3F4F6] text-white dark:text-[#141413] text-xs font-semibold cursor-pointer"
                    >
                      {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                      className="px-2.5 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-[11px] font-medium cursor-pointer"
                    >
                      {authMode === 'signin' ? 'Register' : 'Login'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Advanced Custom Firebase Config */}
        <details className="pt-3 border-t border-[#E5E5E0] dark:border-[#232834]">
          <summary className="text-xs font-medium text-[#5A5A55] dark:text-[#9CA3AF] cursor-pointer select-none hover:text-[#141413] dark:hover:text-[#F3F4F6]">
            Advanced: Custom Firebase Web Config JSON
          </summary>
          <div className="mt-3 space-y-2.5">
            <label htmlFor="firebase-config-json" className="block text-xs font-medium">
              Firebase Web Config JSON
            </label>
            <textarea
              id="firebase-config-json"
              rows={5}
              value={configDraft}
              onChange={(e) => setConfigDraft(e.target.value)}
              placeholder='{"apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..."}'
              className="w-full rounded-xl bg-[#F7F7F5] dark:bg-[#0B0D11] border border-[#E5E5E0] dark:border-[#232834] px-3.5 py-2.5 text-xs font-mono text-[#141413] dark:text-[#F3F4F6]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleConnect()}
                className="px-4 py-2 rounded-xl bg-[#4338CA] dark:bg-[#6366F1] text-white text-xs font-semibold cursor-pointer"
              >
                Apply Config
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setConfigDraft(DEFAULT_FIREBASE_CONFIG_JSON);
                  void onDisconnectFirebase().then(() => {
                    setStatusMessage('Restored built-in Sankalpa Firebase configuration.');
                  });
                }}
                className="px-4 py-2 rounded-xl border border-[#E5E5E0] dark:border-[#232834] text-xs font-medium cursor-pointer"
              >
                Restore Built-in Config
              </button>
            </div>
          </div>
        </details>

        {(statusMessage || syncError) && (
          <p className="text-xs font-medium text-[#4338CA] dark:text-[#A5B4FC]">
            {syncError || statusMessage}
          </p>
        )}
      </section>
    </div>
  );
};
