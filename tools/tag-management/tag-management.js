
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html } from 'da-lit';

const CATALOGUE_PATH = 'config/tag-catalogue.json';

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
    selectedNamespace: { state: true },
    selectedParent: { state: true },
    tagName: { state: true },
    tagDescription: { state: true },
  };

  constructor() {
    super();
    this.namespaces = [];
    this.namespaceName = '';
    this.description = '';
    this.status = 'Loading namespaces...';
    this.busy = false;
    this.selectedNamespace = '';
    this.selectedParent = '';
    this.tagName = '';
    this.tagDescription = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.loadNamespaces();
  }

async getConfig() {
  const response = await fetch(
    `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`,
    {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Could not load catalogue (${response.status})`);
  }

  return response.json();
}

  async loadNamespaces() {
  try {
    const catalogue = await this.getConfig();
    this.namespaces = catalogue.data || [];
    this.status = `${this.namespaces.length} namespace(s) loaded.`;
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

      const updatedCatalogue = {
  ...existing,
  ':sheetname': existing?.[':sheetname'] || 'tag-catalogue',
  ':type': existing?.[':type'] || 'sheet',
  total: updatedRows.length,
  data: updatedRows,
};

const formData = new FormData();
formData.append(
  'data',
  new Blob([JSON.stringify(updatedCatalogue, null, 2)], {
    type: 'application/json',
  }),
  'tag-catalogue.json',
);

const response = await fetch(
  `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${this.token}`,
    },
    body: formData,
  },
);

if (!response.ok) {
  throw new Error(`Save failed (${response.status}): ${responseText || 'No response details'}`); 
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

  async createTag(event) {
  event.preventDefault();

  const namespace = this.selectedNamespace;
  const tag = this.tagName.trim().toLowerCase();
  const parent = this.selectedParent;
  const tagDescription = this.tagDescription.trim();

  if (!namespace) {
    this.status = 'Please select a namespace.';
    return;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
    this.status =
      'Use lowercase letters, numbers, and hyphens only.';
    return;
  }

  this.busy = true;
  this.status = 'Saving tag...';

  try {
    const existing = await this.getConfig();
    const rows = existing?.data || [];

    const duplicate = rows.some(
      (row) =>
        row.namespace === namespace &&
        row.tag === tag &&
        (row.parent || '') === parent,
    );

    if (duplicate) {
      throw new Error(
        `Tag "${tag}" already exists under this parent.`,
      );
    }

    if (parent) {
      const parentExists = rows.some(
        (row) =>
          row.namespace === namespace &&
          row.tag === parent,
      );

      if (!parentExists) {
        throw new Error('The selected parent tag does not exist.');
      }
    }

    const updatedRows = [
      ...rows,
      {
        namespace,
        description: tagDescription,
        tag,
        parent,
      },
    ];

    const updatedCatalogue = {
      ...existing,
      ':sheetname': existing?.[':sheetname'] || 'tag-catalogue',
      ':type': existing?.[':type'] || 'sheet',
      total: updatedRows.length,
      data: updatedRows,
    };

    const formData = new FormData();
    formData.append(
      'data',
      new Blob(
        [JSON.stringify(updatedCatalogue, null, 2)],
        { type: 'application/json' },
      ),
      'tag-catalogue.json',
    );

    const response = await fetch(
      `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        body: formData,
      },
    );

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Save failed (${response.status}): ${responseText}`,
      );
    }

    this.tagName = '';
    this.tagDescription = '';
    this.selectedParent = '';
    this.status = `Tag "${tag}" saved under "${parent || namespace}".`;

    await this.loadNamespaces();
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

          <h2>Create tag</h2>

<form @submit=${this.createTag}>
  <label for="tag-namespace">Select namespace</label>

  <select
    id="tag-namespace"
    required
    .value=${this.selectedNamespace}
    @change=${(event) => {
      this.selectedNamespace = event.target.value;
      this.selectedParent = '';
    }}
  >
    <option value="">Choose a namespace</option>

    ${this.namespaces
      .filter((item) => item.namespace && !item.tag)
      .map(
        (item) => html`
          <option value=${item.namespace}>
            ${item.namespace}
          </option>
        `,
      )}
  </select>

  <label for="tag-parent">Parent tag</label>

  <select
    id="tag-parent"
    .value=${this.selectedParent}
    @change=${(event) => {
      this.selectedParent = event.target.value;
    }}
  >
    <option value="">None — top-level tag</option>

    ${this.namespaces
      .filter(
        (item) =>
          item.namespace === this.selectedNamespace &&
          item.tag,
      )
      .map(
        (item) => html`
          <option value=${item.tag}>${item.tag}</option>
        `,
      )}
  </select>

  <label for="tag-name">Tag name</label>

  <input
    id="tag-name"
    required
    maxlength="60"
    placeholder="e.g. software"
    .value=${this.tagName}
    @input=${(event) => {
      this.tagName = event.target.value;
    }}
  />

  <label for="tag-description">Tag description</label>

  <input
    id="tag-description"
    maxlength="200"
    placeholder="Describe this tag"
    .value=${this.tagDescription}
    @input=${(event) => {
      this.tagDescription = event.target.value;
    }}
  />

  <button
    type="submit"
    ?disabled=${this.busy || !this.selectedNamespace}
  >
    ${this.busy ? 'Saving...' : 'Create tag'}
  </button>
</form>
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
