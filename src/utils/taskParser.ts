export interface TaskStats {
    total: number;
    completed: number;
    isComplete: boolean;
}

export function parseTasks(content: string): TaskStats {
    // Matches standard markdown tasks (- [ ], * [x]) and optional prefixes (- [ ])
    const taskRegex = /^\s*(?:>\s*)?[-*+]\s*\[([ xX/>-])\]/gm;
    
    let total = 0;
    let completed = 0;
    let match;

    while ((match = taskRegex.exec(content)) !== null) {
        total++;
        // Check for finished states: [x] or [X]
        if (match[1] && match[1].toLowerCase() === 'x') {
            completed++;
        }
    }

    return {
        total,
        completed,
        isComplete: total > 0 && total === completed
    };
}