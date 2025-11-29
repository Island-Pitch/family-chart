#!/usr/bin/env python3
"""
Normalize JSON field names: convert "first name" -> "first_name", etc.
"""
import json
import os
import re
from pathlib import Path

def normalize_key(key):
    """Convert 'first name' to 'first_name', etc."""
    return re.sub(r'\s+', '_', key.strip())

def normalize_object(obj):
    """Recursively normalize all keys in an object."""
    if isinstance(obj, dict):
        return {normalize_key(k): normalize_object(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [normalize_object(item) for item in obj]
    else:
        return obj

def main():
    data_dir = Path(__file__).parent / 'data'
    json_files = sorted(data_dir.glob('*.json'))
    
    print(f"Found {len(json_files)} JSON files to normalize\n")
    
    for json_file in json_files:
        print(f"Processing {json_file.name}...", end=' ')
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            normalized = normalize_object(data)
            
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(normalized, f, indent=2, ensure_ascii=False)
                f.write('\n')
            
            print("✓")
        except Exception as e:
            print(f"✗ Error: {e}")
    
    print(f"\n✓ Normalized {len(json_files)} files")

if __name__ == '__main__':
    main()

