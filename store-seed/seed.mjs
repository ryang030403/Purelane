// Seeds a Shopify dev store with everything the Purelane sections read:
// metafield + metaobject definitions, products (with images), bundle
// products, the bestsellers collection and review entries.
//
// Safe to re-run: existing definitions, products, collections and reviews
// (matched by key / handle) are skipped or upserted.
//
//   SHOPIFY_STORE=your-store.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_... node store-seed/seed.mjs
//   (or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for a Dev Dashboard app)
//
// Admin API scopes: write_products, write_files, write_metaobject_definitions,
// write_metaobjects, write_publications, write_inventory.
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const data = JSON.parse(readFileSync(path.join(here, 'data.json'), 'utf8'));
const STORE = (process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';

if (!STORE) fail('Set SHOPIFY_STORE (e.g. purelane-dev.myshopify.com).');

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/* ---------------- auth + GraphQL ---------------- */
async function getToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  const { SHOPIFY_CLIENT_ID: id, SHOPIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) fail('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.');
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) fail(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const TOKEN = await getToken();

async function gql(query, variables = {}, attempt = 0) {
  const res = await fetch(`https://${STORE}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return gql(query, variables, attempt + 1);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    const throttled = JSON.stringify(body.errors || '').includes('THROTTLED');
    if (throttled && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return gql(query, variables, attempt + 1);
    }
    fail(`GraphQL ${res.status}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

// Throws on userErrors except the "already exists" codes we treat as success.
function check(result, label, okCodes = []) {
  const errors = (result.userErrors || []).filter((e) => !okCodes.includes(e.code));
  if (errors.length) fail(`${label}: ${JSON.stringify(errors)}`);
  return result;
}

/* ---------------- 1. metafield definitions ---------------- */
const productDefinitions = [
  { key: 'badge', name: 'Badge', type: 'single_line_text_field', description: 'Pill on product cards, e.g. Best seller, New.' },
  { key: 'benefit', name: 'Benefit', type: 'single_line_text_field', description: 'One-line benefit shown under the product in combo boxes.' },
  {
    key: 'cutout_image',
    name: 'Cut-out image',
    type: 'file_reference',
    description: 'Tall bottle-only image for the hero stage. Falls back to the featured image.',
    validations: [{ name: 'file_type_options', value: '["Image"]' }],
  },
  { key: 'bundle_items', name: 'Bundle items', type: 'list.product_reference', description: 'Products inside this bundle, in display order.' },
  {
    key: 'bundle_size',
    name: 'Bundle size',
    type: 'number_integer',
    description: 'How many products the customer gets (pick-any-N boxes). Defaults to the number of bundle items.',
    validations: [{ name: 'min', value: '1' }],
  },
  { key: 'summary', name: 'Card summary', type: 'multi_line_text_field', description: 'Short text on combo cards. Falls back to the description.' },
];

async function defineMetafields() {
  for (const def of productDefinitions) {
    const { metafieldDefinitionCreate: r } = await gql(
      `mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { field message code } } }`,
      { d: { ...def, namespace: 'custom', ownerType: 'PRODUCT', pin: true } }
    );
    check(r, `metafield custom.${def.key}`, ['TAKEN']);
    console.log(`  ${r.createdDefinition ? '+' : '='} custom.${def.key}`);
  }
  // Shopify's standard review metafields (what review apps write to).
  for (const key of ['rating', 'rating_count']) {
    const { standardMetafieldDefinitionEnable: r } = await gql(
      `mutation($k: String!) { standardMetafieldDefinitionEnable(ownerType: PRODUCT, namespace: "reviews", key: $k, pin: true) { createdDefinition { id } userErrors { field message code } } }`,
      { k: key }
    );
    check(r, `standard reviews.${key}`, ['TAKEN', 'UNSTRUCTURED_ALREADY_EXISTS']);
    console.log(`  ${r.createdDefinition ? '+' : '='} reviews.${key}`);
  }
}

/* ---------------- 2. review metaobject ---------------- */
async function defineReviewMetaobject() {
  const { metaobjectDefinitionCreate: r } = await gql(
    `mutation($d: MetaobjectDefinitionCreateInput!) { metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message code } } }`,
    {
      d: {
        type: 'customer_review',
        name: 'Review',
        description: 'Customer reviews shown in the Purelane reviews rail.',
        displayNameKey: 'title',
        access: { storefront: 'PUBLIC_READ' },
        fieldDefinitions: [
          {
            key: 'rating',
            name: 'Rating',
            type: 'rating',
            required: true,
            validations: [
              { name: 'scale_min', value: '1.0' },
              { name: 'scale_max', value: '5.0' },
            ],
          },
          { key: 'title', name: 'Title', type: 'single_line_text_field' },
          { key: 'body', name: 'Review', type: 'multi_line_text_field', required: true },
          { key: 'author', name: 'Author', type: 'single_line_text_field', required: true },
          { key: 'verified', name: 'Verified purchase', type: 'boolean' },
          { key: 'product', name: 'Product', type: 'product_reference' },
          { key: 'product_label', name: 'Product label', type: 'single_line_text_field', description: 'Short product name on the card. Defaults to the product title.' },
        ],
      },
    }
  );
  check(r, 'metaobject customer_review', ['TAKEN']);
  console.log(`  ${r.metaobjectDefinition ? '+' : '='} customer_review`);
}

/* ---------------- 3. files ---------------- */
const uploaded = new Map();
async function upload(name) {
  if (uploaded.has(name)) return uploaded.get(name);
  const file = path.join(here, 'images', `${name}.png`);
  const { stagedUploadsCreate: r } = await gql(
    `mutation($i: [StagedUploadInput!]!) { stagedUploadsCreate(input: $i) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
    { i: [{ filename: `purelane-${name}.png`, mimeType: 'image/png', httpMethod: 'POST', resource: 'IMAGE', fileSize: String(statSync(file).size) }] }
  );
  check(r, `staged upload ${name}`);
  const target = r.stagedTargets[0];
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), `purelane-${name}.png`);
  const res = await fetch(target.url, { method: 'POST', body: form });
  if (!res.ok) fail(`upload ${name}: ${res.status} ${await res.text()}`);
  uploaded.set(name, target.resourceUrl);
  return target.resourceUrl;
}

async function createFile(name, alt) {
  const source = await upload(name);
  const { fileCreate: r } = await gql(
    `mutation($f: [FileCreateInput!]!) { fileCreate(files: $f) { files { id } userErrors { field message } } }`,
    { f: [{ originalSource: source, contentType: 'IMAGE', alt }] }
  );
  check(r, `file ${name}`);
  return r.files[0].id;
}

/* ---------------- 4. products ---------------- */
const ids = new Map();
let onlineStore = null;

async function findProduct(handle) {
  const d = await gql(`query($h: String!) { productByIdentifier(identifier: { handle: $h }) { id } }`, { h: handle });
  return d.productByIdentifier && d.productByIdentifier.id;
}

async function publish(id) {
  if (!onlineStore) return;
  const { publishablePublish: r } = await gql(
    `mutation($id: ID!, $p: ID!) { publishablePublish(id: $id, input: [{ publicationId: $p }]) { userErrors { field message } } }`,
    { id, p: onlineStore }
  );
  check(r, `publish ${id}`);
}

function metafieldsFor(p) {
  const m = [];
  const add = (namespace, key, type, value) => value !== undefined && value !== null && m.push({ namespace, key, type, value: String(value) });
  add('custom', 'badge', 'single_line_text_field', p.badge);
  add('custom', 'benefit', 'single_line_text_field', p.benefit);
  add('custom', 'summary', 'multi_line_text_field', p.summary);
  add('custom', 'bundle_size', 'number_integer', p.size);
  if (p.items) add('custom', 'bundle_items', 'list.product_reference', JSON.stringify(p.items.map((h) => ids.get(h))));
  if (p.rating) {
    add('reviews', 'rating', 'rating', JSON.stringify({ value: p.rating.toFixed(1), scale_min: '1.0', scale_max: '5.0' }));
    add('reviews', 'rating_count', 'number_integer', p.rating_count);
  }
  return m;
}

async function createProduct(p) {
  const existing = await findProduct(p.handle);
  if (existing) {
    ids.set(p.handle, existing);
    console.log(`  = ${p.handle}`);
    return;
  }
  const metafields = metafieldsFor(p);
  if (p.cutout) {
    const fileId = await createFile(p.cutout, p.title);
    metafields.push({ namespace: 'custom', key: 'cutout_image', type: 'file_reference', value: fileId });
  }
  const media = p.image ? [{ originalSource: await upload(p.image), mediaContentType: 'IMAGE', alt: p.title }] : [];

  const { productCreate: r } = await gql(
    `mutation($p: ProductCreateInput!, $m: [CreateMediaInput!]) {
      productCreate(product: $p, media: $m) {
        product { id variants(first: 1) { nodes { id } } }
        userErrors { field message }
      }
    }`,
    {
      p: {
        title: p.title,
        handle: p.handle,
        descriptionHtml: `<p>${p.description || ''}</p>`,
        productType: p.type,
        vendor: 'Purelane',
        status: 'ACTIVE',
        metafields,
      },
      m: media,
    }
  );
  check(r, `product ${p.handle}`);
  const productId = r.product.id;
  ids.set(p.handle, productId);

  // Price + stock. Untracked = always available; the sold-out product is
  // tracked with 0 on hand and does not oversell.
  const { productVariantsBulkUpdate: v } = await gql(
    `mutation($id: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $id, variants: $v) { userErrors { field message } } }`,
    {
      id: productId,
      v: [
        {
          id: r.product.variants.nodes[0].id,
          price: p.price,
          compareAtPrice: p.compare_at_price || null,
          inventoryPolicy: 'DENY',
          inventoryItem: { tracked: Boolean(p.sold_out) },
        },
      ],
    }
  );
  check(v, `variant ${p.handle}`);
  await publish(productId);
  console.log(`  + ${p.handle}${p.sold_out ? ' (sold out)' : ''}${p.image ? '' : ' (no image)'}`);
}

/* ---------------- 5. collections ---------------- */
async function createCollection(c) {
  const found = await gql(`query($h: String!) { collectionByIdentifier(identifier: { handle: $h }) { id } }`, { h: c.handle });
  if (found.collectionByIdentifier) {
    console.log(`  = ${c.handle}`);
    return;
  }
  const { collectionCreate: r } = await gql(
    `mutation($c: CollectionInput!) { collectionCreate(input: $c) { collection { id } userErrors { field message } } }`,
    { c: { title: c.title, handle: c.handle, sortOrder: 'MANUAL', products: c.products.map((h) => ids.get(h)) } }
  );
  check(r, `collection ${c.handle}`);
  await publish(r.collection.id);
  console.log(`  + ${c.handle} (${c.products.length} products)`);
}

/* ---------------- 6. reviews ---------------- */
async function upsertReview(rv) {
  const fields = [
    { key: 'rating', value: JSON.stringify({ value: rv.rating.toFixed(1), scale_min: '1.0', scale_max: '5.0' }) },
    { key: 'title', value: rv.title },
    { key: 'body', value: rv.body },
    { key: 'author', value: rv.author },
    { key: 'verified', value: String(Boolean(rv.verified)) },
    { key: 'product_label', value: rv.product_label },
  ];
  if (ids.get(rv.product)) fields.push({ key: 'product', value: ids.get(rv.product) });
  const { metaobjectUpsert: r } = await gql(
    `mutation($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!) { metaobjectUpsert(handle: $h, metaobject: $m) { metaobject { id } userErrors { field message code } } }`,
    { h: { type: 'customer_review', handle: rv.handle }, m: { fields } }
  );
  check(r, `review ${rv.handle}`);
  console.log(`  ~ ${rv.handle}`);
}

/* ---------------- run ---------------- */
console.log(`Seeding ${STORE} (Admin API ${VERSION})`);
const shop = await gql(`{ shop { name currencyCode } publications(first: 20) { nodes { id name } } }`);
onlineStore = (shop.publications.nodes.find((p) => p.name === 'Online Store') || {}).id;
if (!onlineStore) console.warn('! No "Online Store" publication found; products will be created but not published.');
if (shop.shop.currencyCode !== 'INR') {
  console.warn(`! Store currency is ${shop.shop.currencyCode}. The design and seed prices are INR; set the store currency to INR first.`);
}

console.log('Metafield definitions');
await defineMetafields();
console.log('Metaobject definition');
await defineReviewMetaobject();
console.log('Products');
for (const p of data.products) await createProduct(p);
console.log('Bundle products');
for (const p of data.bundles) await createProduct(p);
console.log('Collections');
for (const c of data.collections) await createCollection(c);
console.log('Reviews');
for (const rv of data.reviews) await upsertReview(rv);
console.log('\n✔ Done. Push the theme (shopify theme push) and open the homepage.');
