
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
     activeNamespace: { state: true },
activeTagPath: { state: true },
checkedNamespaces: { state: true },
checkedTags: { state: true },
showCreateMenu: { state: true },
formMode: { state: true },
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
    this.activeNamespace = '';
this.activeTagPath = [];
this.checkedNamespaces = [];
this.checkedTags = [];
this.showCreateMenu = false;
this.formMode = '';
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

    if (!Array.isArray(catalogue.data)) {
      throw new Error('Invalid tag catalogue format.');
    }

    this.namespaces = catalogue.data
      .filter((row) => row['Tag ID'] && row.Title && row.Path)
      .map((row) => ({
        tagId: String(row['Tag ID']).trim(),
        title: String(row.Title).trim(),
        path: String(row.Path).trim().replace(/^\/|\/$/g, ''),
      }));

    this.status = `${this.namespaces.length} tag(s) loaded.`;
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

const responseText = await response.text();

if (!response.ok) {
  throw new Error(
    `Save failed (${response.status}): ${responseText || 'No response details'}`,
  );
}
      this.namespaces = updatedRows;
      this.namespaceName = '';
      this.description = '';
      this.status = `Namespace "${name}" saved successfully.`;
      return true;
    } catch (error) {
      this.status = error.message;
      return false;
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
    return false;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
    this.status =
      'Use lowercase letters, numbers, and hyphens only.';
    return false;
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

    await this.loadNamespaces();

    this.status = `Tag "${tag}" saved successfully.`;
    return true;
  } catch (error) {
    this.status = error.message;
    return false;
  } finally {
    this.busy = false;
  }
}


  
getNamespaceRows() {
  const roots = new Map();

  (this.namespaces || []).forEach((tag) => {
    const root = tag.path.split('/')[0];

    if (root && !roots.has(root)) {
      roots.set(root, {
        tagId: root,
        title: root,
        path: root,
      });
    }
  });

  return [...roots.values()];
}

getTagChildren(parentPath) {
  return (this.namespaces || []).filter((tag) => {
    const parts = tag.path.split('/');
    return parts.length > 1
      && parts.slice(0, -1).join('/') === parentPath;
  });
}


selectNamespace(namespace) {
  this.activeNamespace = namespace;
  this.activeTagPath = [];
}

selectTag(tag, depth) {
  this.activeTagPath = [
    ...(this.activeTagPath || []).slice(0, depth),
    tag,
  ];
}

getTagKey(namespace, parentPath, tag) {
  return `${namespace}:${[...parentPath, tag].join('/')}`;
}

// async submitNamespace(event) {
//   await this.saveNamespace(event);

//   if (!this.busy && !this.status?.startsWith('Namespace "')) {
//     return;
//   }

//   if (!this.busy && this.status?.endsWith('saved successfully.')) {
//     this.formMode = '';
//   }
// }

// async submitTag(event) {
//   await this.createTag(event);

//   if (!this.busy && this.status?.startsWith('Tag "')) {
//     this.formMode = '';
//   }
// }

getAllTags() {
  return this.namespaces || [];
}
  
render() {
  const namespaceRows = this.getNamespaceRows();
  const namespace = this.activeNamespace || '';
  const tagPath = this.activeTagPath || [];

  const columns = [];

  if (namespace) {
    columns.push({
      title: `${namespace} tags`,
      parentPath: [],
      rows: this.getTagChildren(namespace, ''),
    });

    tagPath.forEach((tag, depth) => {
      const parentPath = tagPath.slice(0, depth + 1);

      columns.push({
        title: tag,
        parentPath,
        rows: this.getTagChildren(namespace, tag),
      });
    });
  }

  return html`
    <div class="manager">
      <header class="manager-header">
        <div>
          <h1>Tag Management</h1>
          <p>Manage namespaces and nested tags</p>
        </div>

        <div class="create-menu">
          <button
            class="create-button"
            @click=${() => {
              this.showCreateMenu = !this.showCreateMenu;
            }}
          >
            + Create ▾
          </button>

          ${this.showCreateMenu
            ? html`
                <div class="create-dropdown">
                  <button
                    @click=${() => {
                      this.formMode = 'namespace';
                      this.showCreateMenu = false;
                    }}
                  >
                    Create namespace
                  </button>
                  <button
                    @click=${() => {
                      this.formMode = 'tag';
                      this.selectedNamespace = this.activeNamespace || '';
                      this.selectedParent = tagPath[tagPath.length - 1] || '';
                      this.showCreateMenu = false;
                    }}
                  >
                    Create tag
                  </button>
                </div>
              `
            : nothing}
        </div>
      </header>

      ${this.formMode
        ? html`
            <section class="create-form">
              <h2>
                ${this.formMode === 'namespace'
                  ? 'Create namespace'
                  : 'Create tag'}
              </h2>

              ${this.formMode === 'namespace'
                ? html`
                    <form @submit=${async (event) => {
  if (await this.saveNamespace(event)) {
    this.formMode = '';
  }
}}>
                      <label>Namespace name</label>
                      <input
                        required
                        .value=${this.namespaceName || ''}
                        @input=${(event) => {
                          this.namespaceName = event.target.value;
                        }}
                        placeholder="e.g. products"
                      />

                      <label>Description</label>
                      <input
                        .value=${this.description || ''}
                        @input=${(event) => {
                          this.description = event.target.value;
                        }}
                        placeholder="Describe this namespace"
                      />

                      <button type="submit" ?disabled=${this.busy}>Save namespace</button>
                      <button type="button" @click=${() => {
                        this.formMode = '';
                      }}>Cancel</button>
                    </form>
                  `
                : html`
                    <form @submit=${async (event) => {
  if (await this.createTag(event)) {
    this.formMode = '';
  }
}}>
                      <label>Namespace</label>
                      <select
                        required
                        .value=${this.selectedNamespace || ''}
                        @change=${(event) => {
                          this.selectedNamespace = event.target.value;
                          this.selectedParent = '';
                        }}
                      >
                        <option value="">Choose namespace</option>
                        ${namespaceRows.map((row) => html`
                          <option value=${row.namespace}>
                            ${row.namespace}
                          </option>
                        `)}
                      </select>

                      <label>Parent tag</label>
                      <select
                        .value=${this.selectedParent || ''}
                        @change=${(event) => {
                          this.selectedParent = event.target.value;
                        }}
                      >
                        <option value="">None — top-level tag</option>
                        ${this.getAllTags(this.selectedNamespace || '').map((row) => html`
  <option value=${row.tag}>${row.tag}</option>
`)}
                      </select>

                      <label>Tag name</label>
                      <input
                        required
                        .value=${this.tagName || ''}
                        @input=${(event) => {
                          this.tagName = event.target.value;
                        }}
                        placeholder="e.g. running-shoes"
                      />

                      <label>Description</label>
                      <input
                        .value=${this.tagDescription || ''}
                        @input=${(event) => {
                          this.tagDescription = event.target.value;
                        }}
                        placeholder="Describe this tag"
                      />

                      <button type="submit" ?disabled=${this.busy}>Save tag</button>
                      <button type="button" @click=${() => {
                        this.formMode = '';
                      }}>Cancel</button>
                    </form>
                  `}
            </section>
          `
        : nothing}

      <div class="hierarchy">
        <section class="column">
          <h2>Namespaces</h2>

          ${namespaceRows.map((row) => html`
            <div
              class="tree-row ${namespace === row.namespace ? 'active' : ''}"
            >
              <input
                type="checkbox"
                .checked=${(this.checkedNamespaces || []).includes(
                  row.namespace,
                )}
                @change=${(event) => {
                  const selected = new Set(this.checkedNamespaces || []);
                  if (event.target.checked) selected.add(row.namespace);
                  else selected.delete(row.namespace);
                  this.checkedNamespaces = [...selected];
                }}
              />

              <button
                class="row-select"
                @click=${() => this.selectNamespace(row.namespace)}
              >
                ${row.namespace}
                <span>›</span>
              </button>
            </div>
          `)}
        </section>

        ${columns.map((column, depth) => html`
          <section class="column">
            <h2>${column.title}</h2>

            ${column.rows.map((row) => {
              const parentPath = column.parentPath;
              const key = this.getTagKey(
                namespace,
                parentPath,
                row.tag,
              );

              return html`
                <div
                  class="tree-row ${
                    tagPath[depth] === row.tag ? 'active' : ''
                  }"
                >
                  <input
                    type="checkbox"
                    .checked=${(this.checkedTags || []).includes(key)}
                    @change=${(event) => {
                      const selected = new Set(this.checkedTags || []);
                      if (event.target.checked) selected.add(key);
                      else selected.delete(key);
                      this.checkedTags = [...selected];
                    }}
                  />

                  <button
                    class="row-select"
                    @click=${() => this.selectTag(row.tag, depth)}
                  >
                    ${row.tag}
                    ${this.getTagChildren(namespace, row.tag).length
                      ? html`<span>›</span>`
                      : nothing}
                  </button>
                </div>
              `;
            })}

            ${column.rows.length === 0
              ? html`<p class="empty">No child tags</p>`
              : nothing}
          </section>
        `)}
      </div>

      ${this.status
        ? html`<p class="status">${this.status}</p>`
        : nothing}
    </div>
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
