#!/usr/bin/env python3
"""
Extract expected people from each scenario JSON file
"""
import json
import sys
from pathlib import Path

def get_people_from_json(json_file):
    """Extract all people IDs and names from a JSON file."""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    people = []
    for person in data:
        person_id = person.get('id', '')
        person_data = person.get('data', {})
        first_name = person_data.get('first_name', '')
        last_name = person_data.get('last_name', '')
        full_name = person_data.get('full_name', '')
        
        if not full_name and first_name and last_name:
            full_name = f"{first_name} {last_name}"
        elif not full_name:
            full_name = first_name or last_name or person_id
        
        people.append({
            'id': person_id,
            'name': full_name,
            'first_name': first_name,
            'last_name': last_name
        })
    
    return people

def main():
    data_dir = Path(__file__).parent / 'data'
    json_files = sorted(data_dir.glob('sc*.json'))
    
    results = {}
    for json_file in json_files:
        scenario_num = json_file.stem.split('-')[0]  # e.g., 'sc01' from 'sc01-marcos.json'
        people = get_people_from_json(json_file)
        results[scenario_num] = {
            'file': json_file.name,
            'people': people,
            'count': len(people)
        }
    
    # Print results
    for scenario, info in sorted(results.items()):
        print(f"{scenario}: {info['count']} people")
        for person in info['people']:
            print(f"  - {person['name']} ({person['id']})")
        print()

if __name__ == '__main__':
    main()

