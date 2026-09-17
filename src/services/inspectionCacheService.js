const db = require('./database');

const RELATED_TABLES = [
  ['product_images', 'images'],
  ['ocr_results', 'ocr'],
  ['extracted_declarations', 'declaration'],
  ['compliance_checks', 'checks'],
  ['evidence', 'evidence']
];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function upsert(table, row) {
  if (!row?.id) return null;
  const existing = await db.findOne(table, (item) => item.id === row.id);
  if (existing) return db.update(table, row.id, row);
  return db.insert(table, row);
}

async function hydrateInspectionDetail(detail, actor = null) {
  const inspection = detail?.inspection;
  if (!inspection?.id) throw new Error('Cached inspection detail is invalid.');

  await upsert('inspections', {
    ...inspection,
    actor_user_id: inspection.actor_user_id || actor?.id || null,
    actor_role: inspection.actor_role || actor?.role || null
  });

  for (const [table, key] of RELATED_TABLES) {
    const rows = asArray(detail[key]);
    for (const row of rows) {
      if (!row) continue;
      await upsert(table, {
        ...row,
        inspection_id: row.inspection_id || inspection.id
      });
    }
  }

  return { inspection_id: inspection.id };
}

module.exports = {
  hydrateInspectionDetail
};
