#!/bin/bash
# Dashboard Update Utility
# Usage: ./update.sh <task-id> <status> [note]

TASK_ID=$1
STATUS=$2
NOTE=$3
DATA_FILE="data.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -z "$TASK_ID" ] || [ -z "$STATUS" ]; then
    echo "Usage: ./update.sh <task-id> <status> [note]"
    echo "Example: ./update.sh I1.1 ongoing 'Completed login flow'"
    exit 1
fi

# Valid statuses
VALID_STATUSES=("not_started" "analyzing" "ongoing" "done" "blocked")
if [[ ! " ${VALID_STATUSES[@]} " =~ " ${STATUS} " ]]; then
    echo "Invalid status: $STATUS"
    echo "Valid: ${VALID_STATUSES[*]}"
    exit 1
fi

# Check if task exists
if ! grep -q "\"id\": \"$TASK_ID\"" "$DATA_FILE"; then
    echo "Task not found: $TASK_ID"
    exit 1
fi

echo "Updating $TASK_ID to $STATUS..."

# Use node to update JSON (macOS compatible)
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$DATA_FILE', 'utf8'));

// Update status
if (data.tasks['$TASK_ID']) {
    data.tasks['$TASK_ID'].status = '$STATUS';
    data.meta.lastUpdated = '$TIMESTAMP';
    
    // Add activity log entry
    if ('$NOTE') {
        data.tasks['$TASK_ID'].activityLog = data.tasks['$TASK_ID'].activityLog || [];
        data.tasks['$TASK_ID'].activityLog.push({
            date: '$TIMESTAMP',
            note: '$NOTE'
        });
    }
    
    // Recalculate progress (simple version)
    const statusMap = { not_started: 0, analyzing: 25, ongoing: 75, done: 100, blocked: 50 };
    data.tasks['$TASK_ID'].progress = statusMap['$STATUS'];
    
    // Propagate up to parent if done
    if ('$STATUS' === 'done' && data.tasks['$TASK_ID'].parent) {
        const parent = data.tasks[data.tasks['$TASK_ID'].parent];
        if (parent && parent.children) {
            const doneCount = parent.children.filter(c => data.tasks[c]?.status === 'done').length;
            parent.progress = Math.round((doneCount / parent.children.length) * 100);
        }
    }
    
    fs.writeFileSync('$DATA_FILE', JSON.stringify(data, null, 2));
    console.log('Updated $TASK_ID to $STATUS');
    if ('$NOTE') console.log('Added note: $NOTE');
} else {
    console.log('Task not found: $TASK_ID');
    process.exit(1);
}
"
