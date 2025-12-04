#!/bin/bash
# Batch test all scenarios sc01-sc25
# This script will output a summary of test results

echo "Testing all scenarios sc01-sc25..."
echo "============================================================"

for i in {1..25}; do
    scenario=$(printf "sc%02d" $i)
    echo -n "Testing $scenario... "
    
    # Check if HTML file exists
    if [ -f "${scenario}.html" ]; then
        echo "✓ HTML exists"
    else
        echo "✗ HTML missing"
    fi
    
    # Check if JSON file exists
    json_file="data/${scenario}-*.json"
    if ls $json_file 1> /dev/null 2>&1; then
        echo "  ✓ JSON exists"
    else
        echo "  ✗ JSON missing"
    fi
done

echo "============================================================"
echo "Note: Use browser to test for overlaps and missing people"
echo "      Navigate to http://localhost:8080/examples/scenarios/sc##.html"

