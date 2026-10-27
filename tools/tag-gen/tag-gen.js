import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';
import { loadPageTags, loadGenTags, savePageTags, loadTagCatalogue, } from './utils.js';

// Super Lite components
import 'https://da.live/nx/public/sl/components.js';

// Application styles
import loadStyle from '../../scripts/utils/styles.js';

const styles = await loadStyle(import.meta.url);

class RefDemoTagGen extends LitElement {
  static properties = {
    path: { attribute: false },
    token: { attribute: false },
     org: { attribute: false },
  repo: { attribute: false },
  _pageTags: { state: true },
  _genTags: { state: true },
  _catalogue: { state: true },
  _selectedTags: { state: true },
  _selectedNamespace: { state: true },
    _status: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.getPageTags();
  }

  
async getPageTags() {
  this._status = 'Loading tags...';

  try {
    const [pageTags, catalogue] = await Promise.all([
      loadPageTags(this.path, this.token),
      loadTagCatalogue(this.org, this.repo, this.token),
    ]);

    this._pageTags = pageTags;
    this._selectedTags = [...pageTags];
    this._catalogue = catalogue;

    this._selectedNamespace =
      catalogue.find((row) => row.namespace && !row.tag)?.namespace || '';

    this._status = undefined;
  } catch (error) {
    this._status = error.message;
  }
}

get namespaces() {
  return [...new Set(
    (this._catalogue || [])
      .filter((row) => row.namespace && !row.tag)
      .map((row) => row.namespace),
  )];
}

get availableTags() {
  return (this._catalogue || [])
    .filter(
      (row) =>
        row.namespace === this._selectedNamespace && row.tag,
    )
    .map((row) => ({
      ...row,
      qualifiedTag: `${row.namespace}:${row.tag}`,
    }));
}

toggleSelectedTag(tag, checked) {
  const selected = new Set(this._selectedTags || []);

  if (checked) selected.add(tag);
  else selected.delete(tag);

  this._selectedTags = [...selected];
}

addGeneratedTags() {
  const selected = new Set(this._selectedTags || []);

  (this._genTags || []).forEach((tag) => {
    selected.add(tag.includes(':') ? tag : `general:${tag}`);
  });

  this._selectedTags = [...selected];
  this._genTags = undefined;
  this._status = 'Generated suggestions added to your selection.';
}

async updateTags() {
  this._status = 'Saving tags...';

  try {
    const result = await savePageTags(
      this.path,
      this.token,
      this._selectedTags || [],
    );

    if (result.type !== 'success') {
      throw new Error(result.message || 'Could not save tags.');
    }

    this._pageTags = [...(this._selectedTags || [])];
    this._genTags = undefined;
    this._status = 'Tags saved successfully.';
  } catch (error) {
    this._status = error.message;
  }
}


  async generateTags() {
    this._status = 'Generating tags...';
    this._genTags = await loadGenTags(this.path, this.token);
    this._status = undefined;
  }

  async updateTags() {
    this._status = 'Updating page...';
    const { message, type } = await savePageTags(this.path, this.token, this._genTags);
    if (type === 'success') {
      this._pageTags = [...this._genTags];
      this._genTags = undefined;
      this._status = undefined;
    } else {
      this._status = message;
    }
  }

  get title() {
    return this._genTags ? 'Generated tags' : 'Current tags';
  }

  get tags() {
    return this._genTags || this._pageTags;
  }

  renderTags() {
    if (!this.tags) return nothing;

    return html`
    <section class="tag-section">
      <h2>1. Automatic tag generation</h2>
      <button
        class="btn-gradient"
        @click=${this.generateTags}
      >
        Generate tags
      </button>

      ${this._genTags
        ? html`
            <p>Generated suggestions</p>
            <ul>
              ${this._genTags.map(
                (tag) => html`<li>${tag}</li>`,
              )}
            </ul>
            <button @click=${this.addGeneratedTags}>
              Add generated tags to selection
            </button>
          `
        : ''}
    </section>

    <section class="tag-section">
      <h2>2. Select catalogue tags</h2>

      <label for="namespace">Namespace</label>
      <select
        id="namespace"
        .value=${this._selectedNamespace || ''}
        @change=${(event) => {
          this._selectedNamespace = event.target.value;
        }}
      >
        ${this.namespaces.map(
          (namespace) => html`
            <option value=${namespace}>${namespace}</option>
          `,
        )}
      </select>

      <ul>
        ${this.availableTags.map(
          (item) => html`
            <li>
              <label>
                <input
                  type="checkbox"
                  .checked=${(this._selectedTags || []).includes(
                    item.qualifiedTag,
                  )}
                  @change=${(event) =>
                    this.toggleSelectedTag(
                      item.qualifiedTag,
                      event.target.checked,
                    )}
                />
                ${item.tag}
                ${item.description
                  ? html`<small> — ${item.description}</small>`
                  : ''}
              </label>
            </li>
          `,
        )}
      </ul>

      ${this.availableTags.length === 0
        ? html`<p>No catalogue tags available in this namespace.</p>`
        : ''}
    </section>

    <section class="tag-section">
      <h2>3. Selected tags</h2>

      ${(this._selectedTags || []).length
        ? html`
            <ul>
              ${this._selectedTags.map(
                (tag) => html`
                  <li>
                    ${tag}
                    <button
                      @click=${() =>
                        this.toggleSelectedTag(tag, false)}
                    >
                      Remove
                    </button>
                  </li>
                `,
              )}
            </ul>
          `
        : html`<p>No tags selected yet.</p>`}

      <button
        class="btn-gradient"
        @click=${this.updateTags}
      >
        Save tags
      </button>
    </section>
  `;
}

  renderStatus() {
    return html`
      <div class="status-container">
        <svg><use href="https://main--summit-labs--aemsites.aem.live/tools/tag-gen/tag-gen.svg#tag-gen" /></svg>
        <p class="status">${this._status}</p>
      </div>
    `;
  }

  render() {
    if (!this._catalogue && !this._status) return nothing;

  return html`
    ${this._status
      ? html`<p class="status">${this._status}</p>`
      : ''}

    ${this._catalogue ? this.renderTags() : ''}
  `;
}
}

customElements.define('refdemo-tag-gen', RefDemoTagGen);

(async function init() {
  const { context, token } = await DA_SDK;
  const { org, repo, path } = context;

  const cmp = document.createElement('refdemo-tag-gen');
  cmp.path = `/${org}/${repo}${path}`;
  cmp.token = token;
  cmp.org = org;
cmp.repo = repo;

  document.body.append(cmp);
}());
