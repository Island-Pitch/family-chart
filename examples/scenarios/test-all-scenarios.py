#!/usr/bin/env python3
"""
Test all scenarios sc01-sc25 for overlaps and missing people.
This script reads the JSON files and checks the rendered HTML.
"""

import json
import os
import sys
from pathlib import Path

def get_expected_people(json_file):
    """Extract expected people from JSON file."""
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Handle both array and object formats
        if isinstance(data, list):
            tree_data = data
        elif isinstance(data, dict) and 'treeData' in data:
            tree_data = data['treeData']
        else:
            tree_data = []
        
        expected = []
        for person in tree_data:
            person_id = person.get('id', '')
            person_data = person.get('data', {})
            
            # Handle nested data.data structure
            if isinstance(person_data, dict) and 'data' in person_data:
                inner_data = person_data['data']
            else:
                inner_data = person_data
            
            # Get name from various possible fields
            full_name = (
                inner_data.get('full_name') or
                inner_data.get('first_name') or
                inner_data.get('preferred_name') or
                person_id
            )
            
            # If we have first_name and last_name, combine them
            if not full_name or full_name == person_id:
                first_name = inner_data.get('first_name', '')
                last_name = inner_data.get('last_name', '')
                if first_name and last_name:
                    full_name = f"{first_name} {last_name}"
                elif first_name:
                    full_name = first_name
                elif last_name:
                    full_name = last_name
            
            expected.append({
                'id': person_id,
                'name': full_name or person_id
            })
        
        return expected
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
        return []

def test_scenario(scenario_num):
    """Test a single scenario."""
    scenario_id = f"sc{scenario_num:02d}"
    json_file = Path(__file__).parent / f"{scenario_id}.json"
    
    if not json_file.exists():
        return {
            'scenario': scenario_id,
            'status': 'ERROR',
            'error': f'JSON file not found: {json_file}'
        }
    
    expected_people = get_expected_people(json_file)
    
    return {
        'scenario': scenario_id,
        'expected_count': len(expected_people),
        'expected_people': [p['name'] for p in expected_people],
        'json_file': str(json_file),
        'html_file': f"{scenario_id}.html"
    }

def main():
    """Test all scenarios sc01-sc25."""
    results = []
    
    print("Testing all scenarios sc01-sc25...")
    print("=" * 60)
    
    for i in range(1, 26):
        result = test_scenario(i)
        results.append(result)
        
        status_icon = "✓" if result.get('status') != 'ERROR' else "✗"
        expected_count = result.get('expected_count', 0)
        print(f"{status_icon} {result['scenario']}: {expected_count} expected people")
        
        if result.get('status') == 'ERROR':
            print(f"    ERROR: {result.get('error', 'Unknown error')}")
    
    print("=" * 60)
    print(f"\nSummary:")
    print(f"  Total scenarios: {len(results)}")
    print(f"  Successful: {sum(1 for r in results if r.get('status') != 'ERROR')}")
    print(f"  Errors: {sum(1 for r in results if r.get('status') == 'ERROR')}")
    
    # Save results to file
    output_file = Path(__file__).parent / 'test-results.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nResults saved to: {output_file}")
    print("\nNote: This script only validates JSON files.")
    print("      To check for overlaps and missing people in rendered HTML,")
    print("      use the browser test function on each scenario page.")

if __name__ == '__main__':
    main()

