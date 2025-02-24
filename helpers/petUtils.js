/**
 * Computes a pet bucket key based on petInfo.
 * For non-golden pets, buckets are:
 *   - "1-80" if exp is below the threshold for level 81,
 *   - "81-99" if exp is between the level 81 and level 100 thresholds,
 *   - "100" if exp is at or above the level 100 threshold.
 *
 * For golden dragon pets, thresholds are discrete:
 *   e.g. [110, 120, 130, 140, 150, 160, 170, 180, 190, 200]
 * The bucket key will be in the format: `${TIER}_${TYPE};${bucket}`
 * For example, if a LEGENDARY GOLDEN_DRAGON has exp between 140 and 150, its bucket might be "LEGENDARY_GOLDEN_DRAGON;140".
 * 
 * @param {Object} petInfo - The pet information object.
 * @returns {string} The computed pet bucket key.
 */
export const getPetBucket = (petInfo) => {
    const exp = parseFloat(petInfo.exp);
    const tier = petInfo.tier.toUpperCase();
    const type = petInfo.type.toUpperCase();

    // If it's a golden dragon, use special handling.
    if (type === "GOLDEN_DRAGON") {
        // Define discrete thresholds for golden dragons.
        const goldenThresholds = [110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
        let bucket;
        // If exp is below the first threshold, bucket as "1-109"
        if (exp < goldenThresholds[0]) {
            bucket = "1-109";
        } else {
            // Otherwise, iterate thresholds to find the matching bucket.
            // We assume that if exp falls between goldenThresholds[i] (inclusive)
            // and goldenThresholds[i+1] (exclusive), we bucket it as goldenThresholds[i].
            let found = false;
            for (let i = 0; i < goldenThresholds.length - 1; i++) {
                if (exp >= goldenThresholds[i] && exp < goldenThresholds[i + 1]) {
                    bucket = String(goldenThresholds[i]);
                    found = true;
                    break;
                }
            }
            // If exp is at or above the last threshold, bucket it as the last value.
            if (!found) {
                bucket = String(goldenThresholds[goldenThresholds.length - 1]);
            }
        }
        return `${tier}_${type};${bucket}`;
    }

    // For non-golden pets, define thresholds per rarity.
    // Adjust these numeric values as appropriate for your application.
    const thresholds = {
        "UNCOMMON": { 81: 600000, 100: 6000000 },
        "RARE":     { 81: 1000000, 100: 9000000 },
        "EPIC":     { 81: 1500000, 100: 13000000 },
        "LEGENDARY":{ 81: 3000000, 100: 25000000 }
    };

    const rarityThreshold = thresholds[tier];
    if (!rarityThreshold) {
        // If tier isn't recognized, put it in an unknown bucket.
        return `${tier}_${type};UNKNOWN`;
    }

    let range;
    if (exp < rarityThreshold[81]) {
        range = "1-80";
    } else if (exp < rarityThreshold[100]) {
        range = "99";
    } else {
        range = "100";
    }

    return `${tier}_${type};${range}`;
}

export const computePetLevel = (petInfo) => {
    const exp = parseFloat(petInfo.exp);
    const tier = petInfo.tier.toUpperCase();

    const thresholds = {
        "UNCOMMON": [
            { level: 10, exp: 1340 },
            { level: 20, exp: 4955 },
            { level: 30, exp: 14425 },
            { level: 40, exp: 37065 },
            { level: 50, exp: 89285 },
            { level: 60, exp: 233285 },
            { level: 70, exp: 579285 },
            { level: 80, exp: 1308285 },
            { level: 90, exp: 2752785 },
            { level: 100, exp: 5624785 }
        ],
        "RARE": [
            { level: 10, exp: 2320 },
            { level: 20, exp: 8820 },
            { level: 30, exp: 25020 },
            { level: 40, exp: 61720 },
            { level: 50, exp: 157720 },
            { level: 60, exp: 405720 },
            { level: 70, exp: 955720 },
            { level: 80, exp: 2055220 },
            { level: 90, exp: 4237220 },
            { level: 100, exp: 8644220 }
        ],
        "EPIC": [
            { level: 10, exp: 3735 },
            { level: 20, exp: 14115 },
            { level: 30, exp: 38665 },
            { level: 40, exp: 96165 },
            { level: 50, exp: 254665 },
            { level: 60, exp: 629665 },
            { level: 70, exp: 1410665 },
            { level: 80, exp: 2957665 },
            { level: 90, exp: 6034665 },
            { level: 100, exp: 12626665 }
        ],
        "LEGENDARY": [
            { level: 10, exp: 8870 },
            { level: 20, exp: 31510 },
            { level: 30, exp: 83730 },
            { level: 40, exp: 227730 },
            { level: 50, exp: 573730 },
            { level: 60, exp: 1302730 },
            { level: 70, exp: 2747230 },
            { level: 80, exp: 5619230 },
            { level: 90, exp: 11686230 },
            { level: 100, exp: 25353230 }
        ]
    };

    const rarityThresholds = thresholds[tier];
    if (!rarityThresholds) {
        return 1;
    }

    let computedLevel = 1; // Default should always be 1
    for (const threshold of rarityThresholds) {
        if (exp >= threshold.exp) {
            computedLevel = threshold.level;
        } else {
            break;
        }
    }
    return computedLevel;
}