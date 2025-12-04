#!/usr/bin/env python3
"""
Generate comprehensive test report for all scenarios sc01-sc25
This script will create a markdown table report
"""

import json
import os
from pathlib import Path
from datetime import datetime

def generate_markdown_table(results):
    """Generate a markdown table from test results"""
    
    # Table header
    table = "| Scenario | Status | Supported | Expected | Found | Missing | Duplicates | Overlaps | Issues |\n"
    table += "|----------|--------|-----------|----------|-------|---------|------------|----------|--------|\n"
    
    for result in results:
        scenario = result.get('scenario', 'unknown')
        status = result.get('status', 'UNKNOWN')
        supported = '✅' if result.get('supported', False) else '❌'
        summary = result.get('summary', {})
        
        expected = summary.get('totalExpected', 0)
        found = summary.get('totalFound', 0)
        missing = summary.get('missingCount', 0)
        duplicates = summary.get('duplicateCount', 0)
        overlaps = summary.get('nodeOverlapCount', 0)
        issues = len(result.get('issues', []))
        
        # Color code status
        status_emoji = {
            'PASSED': '✅',
            'WARNING': '⚠️',
            'FAILED': '❌',
            'ERROR': '🔴'
        }.get(status, '❓')
        
        status_display = f"{status_emoji} {status}"
        
        # Format issues count
        issues_display = f"{issues}" if issues > 0 else "-"
        
        table += f"| {scenario} | {status_display} | {supported} | {expected} | {found} | {missing} | {duplicates} | {overlaps} | {issues_display} |\n"
    
    return table

def generate_detailed_report(results):
    """Generate detailed markdown report"""
    
    report = f"""# Comprehensive Scenario Test Report

Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## Summary

Total Scenarios: {len(results)}
- ✅ Passed: {sum(1 for r in results if r.get('status') == 'PASSED')}
- ⚠️ Warning: {sum(1 for r in results if r.get('status') == 'WARNING')}
- ❌ Failed: {sum(1 for r in results if r.get('status') == 'FAILED')}
- 🔴 Error: {sum(1 for r in results if r.get('status') == 'ERROR')}

Fully Supported: {sum(1 for r in results if r.get('supported', False))} / {len(results)}

## Test Results Table

{generate_markdown_table(results)}

## Detailed Results

"""
    
    for result in results:
        scenario = result.get('scenario', 'unknown')
        status = result.get('status', 'UNKNOWN')
        supported = result.get('supported', False)
        summary = result.get('summary', {})
        issues = result.get('issues', [])
        missing = result.get('people', {}).get('missing', [])
        duplicates = result.get('people', {}).get('duplicates', [])
        overlaps = result.get('overlaps', {}).get('nodes', [])
        
        report += f"""### {scenario.upper()}

**Status:** {status}  
**Supported:** {'✅ Yes' if supported else '❌ No'}

**Summary:**
- Expected People: {summary.get('totalExpected', 0)}
- Found People: {summary.get('totalFound', 0)}
- Missing People: {summary.get('missingCount', 0)}
- Duplicate Names: {summary.get('duplicateCount', 0)}
- Overlapping Nodes: {summary.get('nodeOverlapCount', 0)}
- Cards Rendered: {summary.get('cardsRendered', 0)}
- Links Rendered: {summary.get('linksRendered', 0)}
- Has Main Person: {'✅' if summary.get('hasMainPerson', False) else '❌'}

"""
        
        if issues:
            report += "**Issues:**\n"
            for issue in issues:
                report += f"- {issue}\n"
            report += "\n"
        
        if missing:
            report += "**Missing People:**\n"
            for person in missing[:10]:  # Limit to first 10
                report += f"- {person.get('name', person.get('id', 'unknown'))} (ID: {person.get('id', 'unknown')})\n"
            if len(missing) > 10:
                report += f"- ... and {len(missing) - 10} more\n"
            report += "\n"
        
        if duplicates:
            report += "**Duplicate Names:**\n"
            for dup in duplicates:
                report += f"- {dup.get('name', 'unknown')}: appears {dup.get('count', 0)} times\n"
            report += "\n"
        
        if overlaps:
            report += "**Overlapping Nodes:**\n"
            for overlap in overlaps[:5]:  # Limit to first 5
                report += f"- {overlap.get('name1', 'unknown')} overlaps with {overlap.get('name2', 'unknown')}\n"
            if len(overlaps) > 5:
                report += f"- ... and {len(overlaps) - 5} more overlaps\n"
            report += "\n"
        
        report += "---\n\n"
    
    return report

def main():
    """Main function"""
    script_dir = Path(__file__).parent
    output_file = script_dir / 'comprehensive-test-report.md'
    
    # For now, create a template report
    # In a real scenario, this would read actual test results
    print("This script generates a report template.")
    print("To generate actual results, run the browser test script on each scenario.")
    print(f"Report will be saved to: {output_file}")
    
    # Create a sample report structure
    sample_results = []
    for i in range(1, 26):
        scenario_id = f"sc{i:02d}"
        sample_results.append({
            'scenario': scenario_id,
            'status': 'PENDING',
            'supported': True,
            'summary': {
                'totalExpected': 0,
                'totalFound': 0,
                'missingCount': 0,
                'duplicateCount': 0,
                'nodeOverlapCount': 0,
                'cardsRendered': 0,
                'linksRendered': 0,
                'hasMainPerson': False
            },
            'issues': [],
            'people': {'missing': [], 'duplicates': []},
            'overlaps': {'nodes': []}
        })
    
    report = generate_detailed_report(sample_results)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"Template report created: {output_file}")
    print("\nTo populate with actual data:")
    print("1. Open each scenario in browser")
    print("2. Run: testScenarioComprehensive(N) where N is scenario number")
    print("3. Collect results and update this script")

if __name__ == '__main__':
    main()

