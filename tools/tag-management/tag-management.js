
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html } from 'da-lit';

const CONFIG_PATH = 'config/tag-catalogue';

class TagManagement extends LitElement {
  static properties = {
    org: { type: String },
    repo: { type: String },
    token: { type: String },
    namespaces: { state: true },
    namespaceName: { state: true },
    description: { state: true },
    status: { state: true },
    busy: { state: true },
  };

  constructor() {
    super();
    this.namespaces = [];
    this.namespaceName = '';
    this.description = '';
    this.status = 'Loading namespaces...';
    this.busy = false;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadNamespaces();
  }

  async getConfig() {
    const response = await fetch(
      `https://admin.da.live/config/${this.org}/${this.repo}/${CONFIG_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
      },
    );

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`Could not load catalogue (${response.status})`);
    }

    return response.json();
  }

  async loadNamespaces() {
    try {
      const config = await this.getConfig();
      this.namespaces = config?.data || [];
      this.status = config
        ? `${this.namespaces.length} namespace(s) loaded.`
        : 'No namespaces yet. Create your first one.';
    } catch (error) {
      this.status = error.message;
    }
  }

  async saveNamespace(event) {
    event.preventDefault();

    const name = this.namespaceName.trim().toLowerCase();
    const description = this.description.trim();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      this.status =
        'Use lowercase letters, numbers, and hyphens only.';
      return;
    }

    if (this.namespaces.some((item) => item.namespace === name)) {
      this.status = `Namespace "${name}" already exists.`;
      return;
    }

    this.busy = true;
    this.status = 'Saving namespace...';

    try {
      // Reload before saving to reduce accidental overwrites.
      const existing = await this.getConfig();
      const rows = existing?.data || [];

      if (rows.some((item) => item.namespace === name)) {
        throw new Error(`Namespace "${name}" already exists.`);
      }

      const updatedRows = [
        ...rows,
        { namespace: name, description },
      ];

      const config = {
  ...existing,
  ':sheetname': existing?.[':sheetname'] || 'tag-catalogue',
  ':type': existing?.[':type'] || 'sheet',
  total: updatedRows.length,
  data: updatedRows,
};

      const formData = new FormData();
      formData.append('config', JSON.stringify(config));

      const response = await fetch(
        `https://admin.da.live/config/${this.org}/${this.repo}/${CONFIG_PATH}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }

      this.namespaces = updatedRows;
      this.namespaceName = '';
      this.description = '';
      this.status = `Namespace "${name}" saved successfully.`;
    } catch (error) {
      this.status = error.message;
    } finally {
      this.busy = false;
    }
  }

  render() {
    return html`
      <main>
        <h1>Tag Management</h1>
        <p>Create and manage namespaces for your site tags.</p>

        <form @submit=${this.saveNamespace}>
          <label for="namespace">Namespace name</label>
          <input
            id="namespace"
            required
            maxlength="60"
            placeholder="e.g. products"
            .value=${this.namespaceName}
            @input=${(event) => {
              this.namespaceName = event.target.value;
            }}
          />

          <label for="description">Description</label>
          <input
            id="description"
            maxlength="200"
            placeholder="What this namespace is for"
            .value=${this.description}
            @input=${(event) => {
              this.description = event.target.value;
            }}
          />

          <button type="submit" ?disabled=${this.busy}>
            ${this.busy ? 'Saving...' : 'Create namespace'}
          </button>
        </form>

        <p role="status">${this.status}</p>

        <h2>Namespaces</h2>

        ${this.namespaces.length
          ? html`
              <ul>
                ${this.namespaces.map(
                  (item) => html`
                    <li>
                      <strong>${item.namespace}</strong>
                      <span>${item.description || ''}</span>
                    </li>
                  `,
                )}
              </ul>
            `
          : html`<p>No namespaces created yet.</p>`}
      </main>
    `;
  }
}

customElements.define('tag-management-app', TagManagement);

(async () => {
  try {
    const { context, token } = await DA_SDK;

    const app = document.createElement('tag-management-app');
    app.org = context.org;
    app.repo = context.repo;
    app.token = token;

    document.body.append(app);
  } catch (error) {
    document.body.textContent =
      `Unable to initialize Tag Management: ${error.message}`;
  }
})();
