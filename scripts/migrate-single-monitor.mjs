import {readFile, writeFile, mkdir, rename, access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function migrateLedger(ledger) {
  if (ledger['gaisen-now']) {
    if (ledger.website || ledger.news) throw new Error('Mixed legacy and current monitoring data');
    return ledger;
  }
  if (!Array.isArray(ledger.website) || !ledger.website.length) throw new Error('Missing original service history');
  // The original root URL is unchanged. Preserve its actual samples and dates.
  // The retired second probe stays in the immutable migration backup only.
  return {'gaisen-now': ledger.website};
}

const exists = async path => { try { await access(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export async function migrateHistory(root = 'history') {
  const ledgerPath = root + '/checks.json';
  const raw = await readFile(ledgerPath, 'utf8');
  const ledger = JSON.parse(raw), migrated = migrateLedger(ledger);
  if (ledger['gaisen-now']) return false;
  const backup = root + '/retired/20261116-single-monitor';
  await mkdir(backup, {recursive: true});
  if (!await exists(backup + '/checks.json')) await writeFile(backup + '/checks.json', raw, {flag:'wx'});
  for (const name of ['website.yml', 'news.yml', 'summary.json']) {
    if (await exists(root + '/' + name) && !await exists(backup + '/' + name))
      await writeFile(backup + '/' + name, await readFile(root + '/' + name), {flag:'wx'});
  }
  if (!await exists(root + '/gaisen-now.yml')) await rename(root + '/website.yml', root + '/gaisen-now.yml');
  for (const name of ['news.yml', 'summary.json']) {
    if (await exists(root + '/' + name)) await rename(root + '/' + name, backup + '/' + name);
  }
  await writeFile(ledgerPath + '.tmp', JSON.stringify(migrated) + '\n');
  await rename(ledgerPath + '.tmp', ledgerPath);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(await migrateHistory() ? 'Migrated to one Gaisen NOW monitor; original history retained.' : 'Single monitor history already active.');
