#!/usr/bin/env node
/**
 * Script to update all scenario HTML files to use shared spacing configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenariosDir = __dirname;
const htmlFiles = fs.readdirSync(scenariosDir)
  .filter(f => f.startsWith('sc') && f.endsWith('.html'))
  .sort();

console.log(`Found ${htmlFiles.length} scenario HTML files to update`);

let updated = 0;
let errors = 0;

for (const filename of htmlFiles) {
  const filepath = path.join(scenariosDir, filename);
  try {
    let content = fs.readFileSync(filepath, 'utf8');
    let modified = false;

    // Update import statement
    const oldImport = /import \{ transformScenarioData, createCardRenderer, createStepsiblingModifier \} from/;
    const newImport = 'import { transformScenarioData, createCardRenderer, createStepsiblingModifier, configureChartSpacing, DEFAULT_CHART_SPACING } from';
    if (oldImport.test(content) && !content.includes('configureChartSpacing')) {
      content = content.replace(oldImport, newImport);
      modified = true;
    }

    // Update createChart function - replace hardcoded spacing
    const oldSpacingPattern = /let f3Chart = f3\.createChart\(['"]#FamilyChart['"], data\)\s*\.setTransitionTime\(1000\)\s*\.setCardXSpacing\(200\)\s*\.setCardYSpacing\(180\);/;
    const newSpacingCode = `let f3Chart = f3.createChart('#FamilyChart', data);
      
      // Configure spacing using shared utility
      f3Chart = configureChartSpacing(f3Chart);`;
    
    if (oldSpacingPattern.test(content)) {
      content = content.replace(oldSpacingPattern, newSpacingCode);
      modified = true;
    }

    // Update progenyDepth to use constant
    const oldProgenyPattern = /f3Chart\.setProgenyDepth\(10\);/;
    const newProgenyCode = `f3Chart.setProgenyDepth(DEFAULT_CHART_SPACING.progenyDepth);`;
    
    if (oldProgenyPattern.test(content)) {
      content = content.replace(oldProgenyPattern, newProgenyCode);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`✓ Updated ${filename}`);
      updated++;
    } else {
      console.log(`- Skipped ${filename} (already updated or no changes needed)`);
    }
  } catch (error) {
    console.error(`✗ Error updating ${filename}:`, error.message);
    errors++;
  }
}

console.log(`\n✓ Updated ${updated} files`);
if (errors > 0) {
  console.log(`✗ ${errors} errors`);
}

