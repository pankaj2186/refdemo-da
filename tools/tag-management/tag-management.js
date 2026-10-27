
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html } from 'da-lit';

import 'https://da.live/nx/public/sl/components.js';

import loadStyle from '../../scripts/utils/styles.js';

const styles = await loadStyle(import.meta.url);

class TagManagement extends LitElement {
  static properties = {
    path: { attribute: false },
    token: { attribute: false },
    _status: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._status = 'Tag Management app initialized.';
  }

  render() {
    return html`
      <h1>Tag Management</h1>
      <p>${this._status}</p>
      <p>Repository: ${this.path || 'Loading...'}</p>
    `;
  }
}

customElements.define('tag-management-app', TagManagement);

(async function init() {
  const { context, token } = await DA_SDK;
  const { org, repo } = context;

  const app = document.createElement('tag-management-app');
  app.path = `/${org}/${repo}`;
  app.token = token;

  document.body.append(app);
}());
