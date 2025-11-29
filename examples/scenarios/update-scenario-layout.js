#!/usr/bin/env node
/**
 * Update all scenario HTML files with the new layout design:
 * - Floating modal for scenario text
 * - JSON formatted below the tree
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Scenario configuration
const scenarios = [
  { id: 'sc01', name: 'Marcos', json: 'sc01-marcos.json', snippet: 'sc01-Marcos.txt' },
  { id: 'sc02', name: 'Eddie', json: 'sc02-eddie.json', snippet: 'sc02.-Eddie.txt' },
  { id: 'sc03', name: 'Jennifer', json: 'sc03-jennifer.json', snippet: 'sc03-Jennifer.txt' },
  { id: 'sc04', name: 'Francine', json: 'sc04-francine.json', snippet: 'sc04-Francine.txt' },
  { id: 'sc05', name: 'Xavier', json: 'sc05-xavier.json', snippet: 'sc05-Xavier.txt' },
  { id: 'sc06', name: 'Philip', json: 'sc06-philip.json', snippet: 'sc06-Phillip.txt' },
  { id: 'sc07', name: 'Geraldo', json: 'sc07-geraldo.json', snippet: 'sc07-Geraldo.txt' },
  { id: 'sc07b', name: 'Geraldo B', json: 'sc07b-geraldo.json', snippet: 'sc07B-Geraldo.txt' },
  { id: 'sc08', name: 'Toni', json: 'sc08-toni.json', snippet: 'sc08-Toni.txt' },
  { id: 'sc09', name: 'Rafael', json: 'sc09-rafael.json', snippet: 'sc09-Rafael.txt' },
  { id: 'sc10', name: 'Cindy', json: 'sc10-cindy.json', snippet: 'sc10-Cindy.txt' },
  { id: 'sc11', name: 'Michael', json: 'sc11-michael.json', snippet: 'sc11-Michael.txt' },
  { id: 'sc12', name: 'Betty', json: 'sc12-betty.json', snippet: 'sc12-Betty.txt' },
  { id: 'sc13', name: 'Clyde', json: 'sc13-clyde.json', snippet: 'sc13-Clyde.txt' },
  { id: 'sc14', name: 'Stephanie', json: 'sc14-stephanie.json', snippet: 'sc14-Stephanie.txt' },
  { id: 'sc15', name: 'Paul', json: 'sc15-paul.json', snippet: 'sc15-Paul.txt' },
  { id: 'sc16', name: 'Pam', json: 'sc16-pam.json', snippet: 'sc16-Pam.txt' },
  { id: 'sc17', name: 'Alec', json: 'sc17-alec.json', snippet: 'sc17-Alec.txt' },
  { id: 'sc18', name: 'Vince', json: 'sc18-vince.json', snippet: 'sc18-Vince.txt' },
  { id: 'sc19', name: 'The Castros', json: 'sc19-castros.json', snippet: 'sc19-The-Castros.txt' },
  { id: 'sc20', name: 'Roberta', json: 'sc20-roberta.json', snippet: 'sc20-Roberta.txt' },
  { id: 'sc21', name: 'Lori', json: 'sc21-lori.json', snippet: 'sc21-Lori.txt' },
  { id: 'sc22', name: 'Samantha', json: 'sc22-samantha.json', snippet: 'sc22-Samantha.txt' },
  { id: 'sc23', name: 'Jason', json: 'sc23-jason.json', snippet: 'sc23-Jason.txt' },
  { id: 'sc24', name: 'Liz', json: 'sc24-liz.json', snippet: 'sc24-Liz.txt' },
  { id: 'sc25', name: 'Henry XIII', json: 'sc25-henry-xiii.json', snippet: 'sc25-Henry-XIII.txt' }
];

// Read the new template
const templatePath = path.join(__dirname, 'scenario-template-new.html');
const template = fs.readFileSync(templatePath, 'utf-8');

console.log('Updating all scenario HTML files with new layout...\n');

let updated = 0;
let errors = 0;

for (const scenario of scenarios) {
  try {
    const htmlFile = path.join(__dirname, `${scenario.id}.html`);
    
    // Replace template variables
    let content = template
      .replace(/\{\{SCENARIO_ID\}\}/g, scenario.id)
      .replace(/\{\{SCENARIO_NAME\}\}/g, scenario.name)
      .replace(/\{\{JSON_FILE\}\}/g, scenario.json)
      .replace(/\{\{SNIPPET_FILE\}\}/g, scenario.snippet);
    
    // Write the updated file
    fs.writeFileSync(htmlFile, content, 'utf-8');
    console.log(`✅ Updated ${scenario.id}.html`);
    updated++;
  } catch (error) {
    console.error(`❌ Error updating ${scenario.id}.html:`, error.message);
    errors++;
  }
}

console.log(`\n✅ Updated ${updated} files`);
if (errors > 0) {
  console.log(`❌ ${errors} errors`);
}

