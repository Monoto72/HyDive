export class SanitizedAuctionManager {
    constructor(endedManager, currentManager) {
        this.endedManager = endedManager;
        this.currentManager = currentManager;
    }

    /**
     * Returns the current auctions augmented with the historical average price (from ended auctions),
     * optionally filtering by attribute key.
     * @param {string} itemName 
     * @param {Object} extraParams - For example, { attributes: "BREEZE;5+MAGIC_FIND;4" }
     * @returns {Object} An object with auctions and overall average price.
     */
    getSanitizedAuctions(itemName, extraParams) {
        // Get current auctions for the item.
        const currentAuctions = this.currentManager.rawStorage.getAuctions(itemName);
        console.log(`Found ${JSON.stringify(currentAuctions)} current auctions for ${itemName}`);
        if (!currentAuctions) return null;
    
        let enrichedAuctions;
    
        // Normalize search term if provided.
        let searchAttr = extraParams && extraParams.attributes
            ? extraParams.attributes.toUpperCase().trim()
            : null;
        if (searchAttr) {
            searchAttr = searchAttr.replace(/\s+/g, '+');
        }
    
        // If auctions are bucketed by attrKey, process each bucket.
        if (typeof currentAuctions === 'object' && !Array.isArray(currentAuctions)) {
            enrichedAuctions = {};
            for (const bucketKey in currentAuctions) {
                // If a search term is provided, skip buckets that don't match.
                if (searchAttr && !bucketKey.includes(searchAttr)) {
                    continue;
                }
                const bucket = currentAuctions[bucketKey];
                console.log(`Processing bucket "${bucketKey}" with ${bucket.length} auctions`);
                const total = bucket.reduce((sum, a) => sum + a.price, 0);
                const avgPrice = bucket.length ? total / bucket.length : null;

                const enhancedAuctions = bucket.map(a => {
                    console.log(a);
                    return {
                        uuid: a.auctionRecord && a.auctionRecord.uuid ? a.auctionRecord.uuid : "",
                        price: a.auctionRecord && a.auctionRecord.price ? a.auctionRecord.price : 0,
                    };
                });

                enrichedAuctions[bucketKey] = {
                    auctions: enhancedAuctions,
                    avgPrice
                };
            }
        } else {
            // If it's a simple array, wrap it into a default bucket.
            const total = currentAuctions.reduce((sum, a) => sum + a.price, 0);
            const avgPrice = currentAuctions.length ? total / currentAuctions.length : null;
            enrichedAuctions = {
                default: {
                    auctions: currentAuctions,
                    avgPrice
                }
            };
        }
    
        // Optionally, compute an overall average (across all buckets).
        const overallAvg = this.endedManager.computeAvgPrice(itemName);
    
        return {
            auctions: enrichedAuctions,
            overallAvg
        };
    }

    /**
     * Returns auctions for all items that contain the specified attribute at the given level.
     * If `onwards` is true, returns buckets with levels equal to or greater than the requested level.
     * @param {string} attribute - The attribute to search for (e.g., "MAGIC_FIND")
     * @param {string|number} level - The required level (e.g., "5")
     * @param {boolean} onwards - If true, includes all buckets where the attribute level is >= requested level.
     * @returns {Object} An object with all auctions matching the attribute and level on onwards.
    */
    getAuctionsByAttribute(attribute, level, onwards = false) {
        const results = {};
        const allItems = this.currentManager.rawStorage.dataByItem;
        const reqAttr = attribute.toUpperCase().trim();
        const reqLevel = parseFloat(level);
        console.log(`Searching for attribute ${reqAttr} at level ${reqLevel}${onwards ? " and upwards" : ""}`);

        for (const itemName in allItems) {
            const buckets = allItems[itemName];
            for (const bucketKey in buckets) {
                // MAKE THE GODAMMN KEY "MAGIC_FIND;5+MENDING;4"
                const segments = bucketKey.split('+');
                let matched = false;
                for (const segment of segments) {
                    const parts = segment.split(';');
                    if (parts.length !== 2) continue;
                    const attr = parts[0].toUpperCase().trim();
                    const lvl = parseFloat(parts[1]);
                    console.log(`Item ${itemName}, bucket "${bucketKey}": segment "${segment}" -> attr: ${attr}, lvl: ${lvl}`);
                    if (attr === reqAttr) {
                        if (onwards) {
                            if (lvl >= reqLevel) {
                                console.log(`  --> Matched (onwards): ${lvl} >= ${reqLevel}`);
                                matched = true;
                            } else {
                                console.log(`  --> Not matched (onwards): ${lvl} < ${reqLevel}`);
                            }
                        } else {
                            if (lvl === reqLevel) {
                                console.log(`  --> Matched (exact): ${lvl} === ${reqLevel}`);
                                matched = true;
                            } else {
                                console.log(`  --> Not matched (exact): ${lvl} !== ${reqLevel}`);
                            }
                        }
                        if (matched) break;
                    }
                }
                if (matched) {
                    if (!results[itemName]) {
                        results[itemName] = {};
                    }
                    const bucket = buckets[bucketKey];
                    const total = bucket.reduce((sum, a) => sum + a.price, 0);
                    const avgPrice = bucket.length ? total / bucket.length : null;
                    results[itemName][bucketKey] = {
                        auctions: bucket,
                        avgPrice
                    };
                }
            }
        }
        return results;
    }

    
    /**
     * Returns pet auctions filtered by optional rarity, pet name, level, and candied status.
     * Pet auctions are stored under the key "PETS".
     * 
     * Query parameters (all optional except level defaults to 80 if not provided):
     *  - rarity: e.g. "LEGENDARY"
     *  - name: e.g. "ENDERMAN" (to filter by pet type)
     *  - level: defaults to 80 if not provided (used to filter by bucket range)
     *  - candied: "true" or "false" (if true, only include auctions where petInfo.candyUsed > 0)
     *
     * @param {*} extraParams 
     * @returns 
     */
    getSanitizedPetAuctions(extraParams = {}) {
        // Optional filters; if not provided, we don't filter by that field.
        const reqRarity = extraParams.rarity ? extraParams.rarity.toUpperCase().trim() : null;
        const reqName = extraParams.name ? extraParams.name.toUpperCase().trim() : null;
        const reqLevel = extraParams.level ? parseFloat(extraParams.level) : 80;
        const filterCandied = extraParams.candied === 'true';

        // Retrieve pet auctions stored under "PETS"
        const petAuctions = this.currentManager.rawStorage.getAuctions("PETS");
        if (!petAuctions) {
            console.log("No pet auctions found");
            return null;
        }

        const enriched = {};

        for (const bucketKey in petAuctions) {
            if (reqRarity && !bucketKey.startsWith(reqRarity + "_")) continue;
            if (reqName && !bucketKey.includes(reqName)) continue;

            const parts = bucketKey.split(";");
            if (parts.length !== 2) continue;
            const bucketRange = parts[1].trim();

            let bucketMatches = false;
            if (bucketRange.includes("-")) {
                // Allow user to query by level range like "81-99" or even "42"
                const [low, high] = bucketRange.split("-").map(Number);
                if (reqLevel >= low && reqLevel <= high) {
                    bucketMatches = true;
                }
            } else if (bucketRange.toUpperCase() === "SPECIAL") {
                bucketMatches = true;
            } else {
                const bucketNum = parseFloat(bucketRange);
                if (bucketNum === reqLevel) {
                    bucketMatches = true;
                }
            }
            if (!bucketMatches) continue;

            let bucket = petAuctions[bucketKey];
            if (filterCandied) {
                bucket = bucket.filter(a => a.petInfo && parseFloat(a.petInfo.candyUsed) > 0);
            }
            if (bucket.length === 0) continue;

            // Enhance each auction with pet level and filters to ensure the user doesn't buy a wrong level and/ or candied pet.
            const enhancedAuctions = bucket.map(a => {
                // console.log(a);
                return {
                    uuid: a.auctionRecord && a.auctionRecord.uuid ? a.auctionRecord.uuid : "",
                    price: a.auctionRecord && a.auctionRecord.price ? a.auctionRecord.price : 0,
                    petLevel: a.petInfo ? a.petInfo.petLevel : null,
                    isCandied: a.petInfo ? a.petInfo.isCandied : false
                };
            });

            const total = bucket.reduce((sum, a) => {
                return sum + (a.auctionRecord && a.auctionRecord.price ? a.auctionRecord.price : 0);
            }, 0);

            const avgPrice = bucket.length ? total / bucket.length : null;
            enriched[bucketKey] = {
                auctions: enhancedAuctions,
                avgPrice
            };
        }

        const overallAvg = this.endedManager.computeAvgPrice("PETS");
        return {
            auctions: enriched,
            overallAvg
        };
    }
}
