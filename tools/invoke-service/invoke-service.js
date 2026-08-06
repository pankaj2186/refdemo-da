// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';

// Super Lite components (sl-button, etc.)
import 'https://da.live/nx/public/sl/components.js';

// Application styles (adopted into the shadow root)
import loadStyle from '../../scripts/utils/styles.js';

const styles = await loadStyle(import.meta.url);

/* ── SVG icons (Lit templates) ──────────────────────────────────────── */

const iconSuccess = () => html`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="none">
    <circle cx="12" cy="12" r="11" fill="#12805c"></circle>
    <path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>`;

const iconFailure = () => html`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="none">
    <circle cx="12" cy="12" r="11" fill="#d7373f"></circle>
    <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2" stroke-linecap="round"></path>
  </svg>`;

/* ── Placeholders config ─────────────────────────────────────────────── */

function buildPlaceholdersUrl(org, repo) {
  return `https://main--${repo}--${org}.aem.live/config/placeholder.json`;
}

async function fetchPlaceholders(org, repo) {
  const url = buildPlaceholdersUrl(org, repo);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Placeholders fetch failed: ${resp.status}`);
  const json = await resp.json();

  const lookup = {};
  (json.data || []).forEach((row) => {
    if (row.key) lookup[row.key.toLowerCase()] = row.value || '';
  });

  let rawPayload = lookup['external-service-payload'] || '';
  if (rawPayload.startsWith("'") && rawPayload.endsWith("'")) {
    rawPayload = rawPayload.slice(1, -1);
  }

  return {
    externalServiceUrl: lookup['external-service-url'] || '',
    externalServicePayload: rawPayload,
  };
}

/* ── User profile ────────────────────────────────────────────────────── */

async function fetchUserProfile(token) {
  try {
    const resp = await fetch('https://ims-na1.adobelogin.com/ims/profile/v1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return { userName: '', userEmail: '' };
    const profile = await resp.json();
    return {
      userName: profile.displayName || profile.name || '',
      userEmail: profile.email || '',
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[invoke-service] Failed to fetch user profile:', e);
    return { userName: '', userEmail: '' };
  }
}

/* ── Resolve org / repo from DA SDK context ──────────────────────────── */

function resolveOrgRepo(context) {
  if (context.org && context.repo) {
    return { org: context.org, repo: context.repo, path: context.path || '/' };
  }

  const url = context.url || context.location || context.href || '';
  const hashPath = url.includes('#') ? url.split('#')[1] : '';
  const segments = (hashPath || '').split('/').filter(Boolean);
  if (segments.length >= 2) {
    return { org: segments[0], repo: segments[1], path: `/${segments.slice(2).join('/')}` };
  }

  const values = Object.values(context).filter((v) => typeof v === 'string');
  const slashVal = values.find((v) => v.split('/').filter(Boolean).length >= 2);
  if (slashVal) {
    const parts = slashVal.split('/').filter(Boolean);
    return { org: parts[0], repo: parts[1], path: `/${parts.slice(2).join('/')}` };
  }

  throw new Error(`Could not resolve org/repo from context: ${JSON.stringify(context)}`);
}

function buildAemPageUrl(org, repo, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `https://main--${repo}--${org}.aem.live${normalizedPath}`;
}

/* ── External service call ───────────────────────────────────────────── */

async function invokeExternalService(token, context) {
  // eslint-disable-next-line no-console
  console.log('[invoke-service] DA SDK context →', JSON.stringify(context, null, 2));

  const { org, repo, path } = resolveOrgRepo(context);
  // eslint-disable-next-line no-console
  console.log('[invoke-service] Resolved →', { org, repo, path });

  const [profile, config] = await Promise.all([
    fetchUserProfile(token),
    fetchPlaceholders(org, repo).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[invoke-service] Placeholders fetch failed:', err);
      return { externalServiceUrl: '', externalServicePayload: '' };
    }),
  ]);

  const resolvedUrl = config.externalServiceUrl;
  if (!resolvedUrl) {
    throw new Error(
      'External service URL is not configured. Add an "external-service-url" entry to /config/placeholder.json.',
    );
  }

  let resolvedPayload;
  if (config.externalServicePayload) {
    try {
      resolvedPayload = JSON.parse(config.externalServicePayload);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[invoke-service] Failed to parse custom payload, using default:', e);
    }
  }

  if (!resolvedPayload) {
    resolvedPayload = {
      org,
      repo,
      path,
      'user-name': profile.userName,
      'user-email': profile.userEmail,
    };
  }

  resolvedPayload.aemPageUrl = buildAemPageUrl(org, repo, path);

  // eslint-disable-next-line no-console
  console.log('[invoke-service] Calling service →', resolvedUrl);

  const resp = await fetch(resolvedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resolvedPayload),
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    throw new Error(`External service error: ${resp.status} – ${errorBody}`);
  }

  return resp.json();
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function isAdobeUser(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@adobe.com');
}

/* ── Lit component ───────────────────────────────────────────────────── */

class ADLInvokeService extends LitElement {
  static properties = {
    token: { attribute: false },
    context: { attribute: false },
    onClose: { attribute: false },
    _view: { state: true }, // 'confirm' | 'loading' | 'result' | 'noaccess'
    _isSuccess: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.gateUser();
  }

  async gateUser() {
    const profile = await fetchUserProfile(this.token);
    this._view = isAdobeUser(profile.userEmail) ? 'confirm' : 'noaccess';
  }

  async run() {
    this._view = 'loading';
    try {
      await invokeExternalService(this.token, this.context);
      this._isSuccess = true;
      this._message = 'The external service executed successfully.';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[invoke-service] Error:', err);
      this._isSuccess = false;
      this._message = err.message || 'An unexpected error occurred.';
    }
    this._view = 'result';
  }

  close() {
    if (this.onClose) this.onClose();
  }

  renderConfirm() {
    return html`
      <div class="invoke-service-panel">
        <p class="invoke-service-message">Invoke the external service for this document?</p>
        <div class="invoke-service-actions">
          <sl-button class="secondary" @click=${this.close}>Cancel</sl-button>
          <sl-button @click=${this.run}>Confirm</sl-button>
        </div>
      </div>`;
  }

  renderResult() {
    return html`
      <div class="invoke-service-panel">
        <div class="invoke-service-result">
          <div class="invoke-service-icon">${this._isSuccess ? iconSuccess() : iconFailure()}</div>
          <p class="invoke-service-label">${this._isSuccess ? 'Success' : 'Failed'}</p>
          <p class="invoke-service-detail">${this._message}</p>
        </div>
        <div class="invoke-service-actions">
          <sl-button @click=${this.close}>Close</sl-button>
        </div>
      </div>`;
  }

  renderNoAccess() {
    return html`
      <div class="invoke-service-panel">
        <div class="invoke-service-result">
          <div class="invoke-service-icon">${iconFailure()}</div>
          <p class="invoke-service-label">Access denied</p>
          <p class="invoke-service-detail">You do not have permission to run this extension. Please contact an Adobe administrator if you believe this is a mistake.</p>
        </div>
        <div class="invoke-service-actions">
          <sl-button @click=${this.close}>Close</sl-button>
        </div>
      </div>`;
  }

  render() {
    switch (this._view) {
      case 'confirm': return this.renderConfirm();
      case 'loading': return html`
        <div class="invoke-service-panel">
          <div class="invoke-service-loading">
            <div class="spinner" aria-hidden="true"></div>
            <p class="invoke-service-message">Executing external service…</p>
          </div>
        </div>`;
      case 'result': return this.renderResult();
      case 'noaccess': return this.renderNoAccess();
      default: return nothing;
    }
  }
}

customElements.define('adl-invoke-service', ADLInvokeService);

/* ── Init ────────────────────────────────────────────────────────────── */

(async function init() {
  const { context, token, actions } = await DA_SDK;

  const cmp = document.createElement('adl-invoke-service');
  cmp.token = token;
  cmp.context = context;
  cmp.onClose = () => actions.closeLibrary();

  document.body.append(cmp);
}());
