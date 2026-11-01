import { useRef, useState, type FormEvent } from "react";
import { Alert, Button, Checkbox, PasswordInput, TextInput } from "@mantine/core";
import { desktopApi } from "../../lib/desktop-api";
import type { DesktopState } from "../../models/topology";
import type { TunnelConnection, TunnelProxyOverride } from "../../models/connections-tools";
import { useLocale } from "../../i18n/locale";
import { useProduct } from "../../i18n/product";
import { useConnectionsTools } from "../../i18n/connections-tools";
import { WorkspaceDialog } from "../workspace/WorkspaceDialog";

type ProxyChoice = "global" | TunnelProxyOverride["mode"];

export function ConnectionEditor({ profile, onState, onClose }: { profile: TunnelConnection | null; onState: (state: DesktopState) => void; onClose: () => void }) {
  const p = useProduct(); const c = useConnectionsTools(); const { t } = useLocale();
  const [proxyChoice, setProxyChoice] = useState<ProxyChoice>(profile?.proxy?.mode ?? "global");
  const [proxyUrl, setProxyUrl] = useState(profile?.proxy?.custom_url ?? "");
  const proxy: TunnelProxyOverride | null = proxyChoice === "global" ? null : proxyChoice === "custom" ? { mode: "custom", custom_url: proxyUrl.trim() } : { mode: proxyChoice };
  const [name, setName] = useState(profile?.name || "");
  const [tunnelId, setTunnelId] = useState(profile?.tunnel_id || "");
  const [apiKey, setApiKey] = useState("");
  const [autostart, setAutostart] = useState(profile?.autostart ?? true);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const submitted = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (submitted.current) return;
    submitted.current = true; setBusy(true); setFailed(false);
    const request = { id: profile?.id ?? null, name: name.trim(), tunnel_id: tunnelId.trim(), api_key: apiKey || null, autostart, expected_revision: profile?.revision ?? null, proxy };
    setApiKey("");
    try { onState(await desktopApi.saveTunnelProfile(request)); onClose(); }
    catch { setFailed(true); }
    finally { request.api_key = null; submitted.current = false; setBusy(false); }
  };
  return <WorkspaceDialog title={profile ? `${p("edit")} ${profile.name}` : c("addConnection")} onClose={onClose} busy={busy}>
    <form className="profile-editor" onSubmit={event => void submit(event)} aria-busy={busy}>
      <p className="field-help">{p("tunnelCredentialHelp")}</p>
      <TextInput className="field-group" id="connection-profile-name" label={c("name")} aria-label={c("name")} name="name" value={name} onChange={event => setName(event.currentTarget.value)} required maxLength={160} disabled={busy} autoFocus />
      <TextInput className="field-group" id="connection-profile-tunnel-id" label="Tunnel ID" aria-label="Tunnel ID" name="tunnel_id" value={tunnelId} onChange={event => setTunnelId(event.currentTarget.value)} required maxLength={256} pattern="(?:[A-Za-z0-9_]|-)+" spellCheck={false} autoCapitalize="none" disabled={busy} />
      <PasswordInput className="field-group" id="connection-profile-api-key" label="API Key" aria-label="API Key" name="api_key" value={apiKey} onChange={event => setApiKey(event.currentTarget.value)} required={!profile?.credential_present} maxLength={8192} autoComplete="new-password" spellCheck={false} disabled={busy} description={profile?.credential_present ? p("savedKey") : undefined} />
      <div className="field-group"><label htmlFor="connection-profile-proxy-mode">{c("connectionProxy")}</label><select id="connection-profile-proxy-mode" name="proxy_mode" value={proxyChoice} onChange={event => setProxyChoice(event.target.value as ProxyChoice)} disabled={busy} data-webcodex-control="connection-proxy-mode"><option value="global">{c("followGlobalProxy")}</option><option value="auto">{t("settings.tunnelProxyAuto")}</option><option value="direct">{t("settings.tunnelProxyDirect")}</option><option value="custom">{t("settings.tunnelProxyCustom")}</option></select></div>
      {proxyChoice === "custom" && <TextInput className="field-group" id="connection-profile-proxy-url" label={t("settings.tunnelProxyCustomUrl")} aria-label={t("settings.tunnelProxyCustomUrl")} name="proxy_url" value={proxyUrl} onChange={event => setProxyUrl(event.currentTarget.value)} placeholder="http://127.0.0.1:7890" required maxLength={2048} spellCheck={false} autoCapitalize="none" disabled={busy} />}
      <Checkbox className="profile-checkbox" id="connection-profile-autostart" label={c("autostart")} checked={autostart} onChange={event => setAutostart(event.currentTarget.checked)} disabled={busy} />
      {failed && <Alert color="red" role="alert">{c("operationFailed")}</Alert>}
      <div className="connection-actions"><Button type="submit" className="primary-button" disabled={busy || !name.trim() || !/^[A-Za-z0-9_-]+$/.test(tunnelId.trim()) || (!profile?.credential_present && !apiKey.trim()) || (proxyChoice === "custom" && !proxyUrl.trim())}>{c("saveApply")}</Button><Button type="button" className="secondary-button" variant="default" disabled={busy} onClick={onClose}>{p("cancel")}</Button></div>
    </form>
  </WorkspaceDialog>;
}
