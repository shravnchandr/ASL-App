/**
 * Sign of the Day — deterministic daily sign picker
 * Uses date string hash to select a consistent sign per day
 */

let cachedSignList: string[] | null = null;

async function getSignList(): Promise<string[]> {
    if (cachedSignList) return cachedSignList;
    try {
        const res = await fetch('/sign-data/metadata.json');
        const data = await res.json();
        // Filter to common/months/numbers (not single letters)
        cachedSignList = Object.keys(data.signs).filter(
            (s: string) => s.length > 1
        );
        return cachedSignList;
    } catch {
        return [];
    }
}

function hashDate(dateStr: string): number {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        hash = hash * 31 + dateStr.charCodeAt(i);
        hash = hash | 0; // force 32-bit integer
    }
    return Math.abs(hash);
}

export async function getSignOfTheDay(): Promise<string | null> {
    const signs = await getSignList();
    if (signs.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    const index = hashDate(today) % signs.length;
    return signs[index];
}
