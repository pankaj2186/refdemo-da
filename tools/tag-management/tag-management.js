// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import loadStyle from '../../scripts/utils/styles.js';
// da.live Super Lite components (sl-button) and the Spectrum 2 tokens they share
// eslint-disable-next-line import/no-unresolved
import 'https://da.live/nx/public/sl/components.js';
import {
  ID_PATTERN,
  addTag,
  buildTree,
  childrenOf,
  isWithin,
  parentOf,
  removeTags,
  toId,
  updateTag,
} from './catalogue.js';

const CATALOGUE_PATH = 'config/tag-catalogue.json';
const EMPTY_SHEET = {
  total: 0, offset: 0, limit: 0, data: [], ':type': 'sheet',
};

const styles = await loadStyle(import.meta.url);

const folderIcon = html`<svg class="icon folder" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h4l2 2h7A1.5 1.5 0 0 1 18 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 15.5z"/></svg>`;
const chevronIcon = html`<svg class="icon chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4 13.5 10l-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

class TagManagement extends LitElement {
  static properties = {
    org: { attribute: false },
    repo: { attribute: false },
    token: { attribute: false },
    tree: { state: true },
    activePath: { state: true },
    checked: { state: true },
    form: { state: true },
    pendingDelete: { state: true },
    status: { state: true },
    busy: { state: true },
    menuOpen: { state: true },
    loading: { state: true },
  };

  constructor() {
    super();
    this.tree = new Map();
    this.activePath = '';
    this.checked = [];
    this.form = null;
    this.pendingDelete = [];
    this.status = 'Loading tags...';
    this.busy = false;
    this.menuOpen = false;
    this.loading = true;
    this.closeMenuOutside = (e) => {
      const menu = this.shadowRoot.querySelector('.create-menu');
      if (this.menuOpen && !e.composedPath().includes(menu)) this.menuOpen = false;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    document.addEventListener('pointerdown', this.closeMenuOutside);
    this.load();
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this.closeMenuOutside);
    super.disconnectedCallback();
  }

  get catalogueUrl() {
    return `https://admin.da.live/source/${this.org}/${this.repo}/${CATALOGUE_PATH}`;
  }

  async fetchSheet() {
    const response = await fetch(this.catalogueUrl, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    // no catalogue yet: start empty so the first namespace can be created
    if (response.status === 404) return { ...EMPTY_SHEET };
    if (!response.ok) throw new Error(`Could not load the tag catalogue (${response.status}).`);
    const sheet = await response.json();
    if (!Array.isArray(sheet.data)) throw new Error('Invalid tag catalogue format: expected a single sheet.');
    return sheet;
  }

  async saveSheet(sheet, data) {
    const body = new FormData();
    const json = JSON.stringify({
      ...sheet, total: data.length, offset: 0, limit: data.length, data,
    }, null, 2);
    body.append('data', new Blob([json], { type: 'application/json' }), 'tag-catalogue.json');
    const response = await fetch(this.catalogueUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body,
    });
    if (!response.ok) throw new Error(`Save failed (${response.status}).`);
  }

  async load() {
    try {
      const { data } = await this.fetchSheet();
      this.tree = buildTree(data);
      this.status = `${this.tree.size} tag(s) loaded.`;
    } catch (error) {
      this.status = error.message;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Re-reads the catalogue, applies a change to its rows and saves it.
   * ponytail: last write wins; DA source has no conditional save to detect concurrent edits.
   * @param {function} change Takes the rows, returns the new rows
   * @returns {Promise<boolean>} Whether the save succeeded
   */
  async mutate(change, progress) {
    this.busy = true;
    this.status = progress;
    try {
      const sheet = await this.fetchSheet();
      await this.saveSheet(sheet, change(sheet.data));
      await this.load();
      return true;
    } catch (error) {
      this.status = error.message;
      return false;
    } finally {
      this.busy = false;
    }
  }

  get columns() {
    const parents = [''];
    this.activePath.split('/').filter(Boolean).forEach((id, index) => {
      parents.push(parents[index] ? `${parents[index]}/${id}` : id);
    });
    return parents
      .map((parent) => ({ parent, tags: childrenOf(this.tree, parent) }))
      .filter(({ parent, tags }) => !parent || tags.length);
  }

  hasChildren(path) {
    return [...this.tree.keys()].some((key) => parentOf(key) === path);
  }

  toggleChecked(path, checked) {
    const selected = new Set(this.checked);
    if (checked) selected.add(path);
    else selected.delete(path);
    this.checked = [...selected];
  }

  selectAll() {
    const { tags } = this.columns.at(-1);
    this.checked = tags.map((tag) => tag.path);
  }

  /**
   * Opens the create form; a namespace goes at the root, a tag under the
   * checked item, or under the open folder when nothing is checked.
   * @param {'namespace'|'tag'} kind What to create
   */
  openCreate(kind) {
    const tagParent = this.checked.length === 1 ? this.checked[0] : this.activePath;
    this.form = {
      mode: 'create',
      parent: kind === 'namespace' ? '' : tagParent,
      title: '',
      id: '',
      description: '',
      idEdited: false,
    };
    this.menuOpen = false;
    this.status = '';
  }

  openEdit() {
    const tag = this.tree.get(this.checked[0]);
    if (!tag) return;
    this.form = {
      mode: 'edit',
      target: tag.path,
      parent: parentOf(tag.path),
      title: tag.title,
      id: tag.id,
      description: tag.description,
      idEdited: true,
    };
    this.status = '';
  }

  updateForm(field, value) {
    const form = { ...this.form, [field]: value };
    if (field === 'id') form.idEdited = true;
    if (field === 'title' && !form.idEdited) form.id = toId(value);
    this.form = form;
  }

  async submitForm(event) {
    event.preventDefault();
    const { mode, parent, target } = this.form;
    const values = {
      id: this.form.id.trim().toLowerCase(),
      title: this.form.title.trim(),
      description: this.form.description.trim(),
    };
    if (!values.title || !ID_PATTERN.test(values.id)) {
      this.status = 'Enter a title and a name using lowercase letters, numbers and hyphens.';
      return;
    }

    let newPath;
    const saved = await this.mutate((rows) => {
      if (mode === 'create') return addTag(rows, { parent, ...values });
      const result = updateTag(rows, target, values);
      newPath = result.path;
      return result.rows;
    }, 'Saving...');
    if (!saved) return;

    if (mode === 'edit' && isWithin(this.activePath, target)) {
      this.activePath = `${newPath}${this.activePath.slice(target.length)}`;
    }
    this.checked = [];
    this.form = null;
    this.status = `"${values.title}" saved.`;
  }

  confirmDelete() {
    // a checked descendant of a checked tag goes with its ancestor
    this.pendingDelete = this.checked.filter((path) => !this.checked
      .some((other) => other !== path && isWithin(path, other)));
    this.updateComplete.then(() => this.shadowRoot.querySelector('dialog').showModal());
  }

  async deletePending() {
    const paths = this.pendingDelete;
    this.shadowRoot.querySelector('dialog').close();
    const deleted = await this.mutate((rows) => removeTags(rows, paths), 'Deleting...');
    if (!deleted) return;
    const removed = paths.find((path) => isWithin(this.activePath, path));
    if (removed !== undefined) this.activePath = parentOf(removed);
    this.checked = [];
    this.status = `Deleted ${paths.length} item(s) and their descendants.`;
  }

  renderHeader() {
    return html`
      <header class="page-header">
        <h1>Tag Management</h1>
        <div
          class="create-menu"
          @keydown=${(e) => { if (e.key === 'Escape') this.menuOpen = false; }}
        >
          <sl-button
            aria-haspopup="true"
            aria-expanded=${this.menuOpen}
            ?disabled=${this.busy}
            @click=${() => { this.menuOpen = !this.menuOpen; }}
          >Create ▾</sl-button>
          ${this.menuOpen ? html`
            <div class="create-dropdown">
              <button @click=${() => this.openCreate('namespace')}>Create a namespace</button>
              <button
                ?disabled=${!this.activePath}
                title=${this.activePath ? `Creates under /${this.activePath}` : 'Open a namespace first'}
                @click=${() => this.openCreate('tag')}
              >Create a tag</button>
            </div>` : nothing}
        </div>
      </header>`;
  }

  renderToolbar() {
    const count = this.checked.length;
    if (count) {
      return html`
        <div class="toolbar has-selection">
          <span class="count">${count} selected</span>
          <button class="action" ?disabled=${this.busy || count > 1} @click=${() => this.openCreate('tag')}>Create tag</button>
          <button class="action" ?disabled=${this.busy || count !== 1} @click=${this.openEdit}>Edit</button>
          <button class="action negative" ?disabled=${this.busy} @click=${this.confirmDelete}>Delete</button>
          <span class="spacer"></span>
          <button class="action" @click=${() => { this.checked = []; }}>Clear selection</button>
        </div>`;
    }
    const crumbs = this.activePath.split('/').filter(Boolean)
      .map((id, index, ids) => ({ id, path: ids.slice(0, index + 1).join('/') }));
    return html`
      <div class="toolbar">
        <nav class="breadcrumbs" aria-label="Current location">
          <button class="action" @click=${() => { this.activePath = ''; }}>All namespaces</button>
          ${crumbs.map(({ id, path }) => html`
            <span aria-hidden="true">/</span>
            <button class="action" aria-current=${path === this.activePath ? 'page' : nothing} @click=${() => { this.activePath = path; }}>${this.tree.get(path)?.title ?? id}</button>`)}
        </nav>
        <span class="spacer"></span>
        <button class="action" @click=${this.selectAll}>Select all</button>
      </div>`;
  }

  renderColumnBody(tags) {
    if (tags.length) return html`<ul>${tags.map((tag) => this.renderRow(tag))}</ul>`;
    if (this.loading) return nothing;
    return html`<p class="empty">No tags yet. Use Create to add a namespace.</p>`;
  }

  renderRow(tag) {
    const checked = this.checked.includes(tag.path);
    const active = isWithin(this.activePath, tag.path);
    return html`
      <li class="row ${active ? 'active' : ''} ${checked ? 'checked' : ''}">
        <input
          type="checkbox"
          aria-label="Select ${tag.title}"
          .checked=${checked}
          @change=${(e) => this.toggleChecked(tag.path, e.target.checked)}
        />
        <button class="row-open" aria-current=${active ? 'true' : nothing} @click=${() => { this.activePath = tag.path; }}>
          ${folderIcon}
          <span class="title">${tag.title}</span>
          ${this.hasChildren(tag.path) ? chevronIcon : nothing}
        </button>
      </li>`;
  }

  renderDetails() {
    const path = this.checked.length === 1 ? this.checked[0] : this.activePath;
    const tag = this.tree.get(path);
    if (!tag) return nothing;
    return html`
      <aside class="details" aria-label="Tag details">
        <div class="preview">${folderIcon}</div>
        <dl>
          <dt>Title</dt><dd>${tag.title}</dd>
          <dt>Name</dt><dd>${tag.id}</dd>
          <dt>Path</dt><dd>/${tag.path}</dd>
          ${tag.description ? html`<dt>Description</dt><dd>${tag.description}</dd>` : nothing}
        </dl>
      </aside>`;
  }

  renderBrowser() {
    return html`
      ${this.renderHeader()}
      ${this.renderToolbar()}
      <div class="browser">
        ${this.columns.map(({ parent, tags }) => html`
          <section class="column" aria-label=${parent ? `Tags in /${parent}` : 'Namespaces'}>
            ${this.renderColumnBody(tags)}
          </section>`)}
        ${this.renderDetails()}
      </div>
      <dialog @close=${() => { this.pendingDelete = []; }}>
        <h2>Delete tags</h2>
        <p>These items and everything under them will be deleted:</p>
        <ul class="paths">${this.pendingDelete.map((path) => html`<li>/${path}</li>`)}</ul>
        <div class="dialog-actions">
          <sl-button class="primary outline" @click=${() => this.shadowRoot.querySelector('dialog').close()}>Cancel</sl-button>
          <sl-button class="negative" @click=${this.deletePending}>Delete</sl-button>
        </div>
      </dialog>`;
  }

  renderForm() {
    const {
      mode, parent, title, id, description,
    } = this.form;
    const noun = parent ? 'Tag' : 'Namespace';
    return html`
      <form class="tag-form" @submit=${this.submitForm}>
        <header class="page-header">
          <h1>${mode === 'create' ? 'Create' : 'Edit'} ${noun}</h1>
          <div class="header-actions">
            <sl-button class="primary outline" @click=${() => { this.form = null; }}>Cancel</sl-button>
            <!-- sl-button's own button lives in its shadow root, so it cannot submit this form -->
            <sl-button ?disabled=${this.busy} @click=${(e) => e.target.closest('form').requestSubmit()}>Save</sl-button>
          </div>
        </header>
        <div class="fields">
          <label for="tag-title">Title *</label>
          <input id="tag-title" required .value=${title} @input=${(e) => this.updateForm('title', e.target.value)} />

          <label for="tag-id">Name *</label>
          <input
            id="tag-id"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            aria-describedby="tag-id-hint"
            .value=${id}
            @input=${(e) => this.updateForm('id', e.target.value)}
          />
          <p id="tag-id-hint" class="hint">Lowercase letters, numbers and hyphens.${mode === 'edit' ? ' Changing it moves the tag and its children.' : ''}</p>

          <label for="tag-description">Description</label>
          <textarea id="tag-description" rows="5" .value=${description} @input=${(e) => this.updateForm('description', e.target.value)}></textarea>

          ${parent ? html`
            <label for="tag-path">Tag Path</label>
            <input id="tag-path" readonly .value=${`/${parent}`} />` : nothing}
        </div>
      </form>`;
  }

  render() {
    return html`
      ${this.form ? this.renderForm() : this.renderBrowser()}
      <p class="status" role="status">${this.status}</p>`;
  }
}

customElements.define('tag-management-app', TagManagement);

(async function init() {
  try {
    const { context, token } = await DA_SDK;
    const app = document.createElement('tag-management-app');
    app.org = context.org;
    app.repo = context.repo;
    app.token = token;
    document.body.append(app);
  } catch (error) {
    document.body.textContent = `Unable to initialize Tag Management: ${error.message}`;
  }
}());
