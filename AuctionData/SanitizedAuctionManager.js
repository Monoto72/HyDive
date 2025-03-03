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
        if (!currentAuctions) return null;
    
        let enrichedAuctions;
    
        // Normalize search term if provided. -- e.g., "magic find" -> "MAGIC_FIND"
        let searchAttr = extraParams && (extraParams.attribute || extraParams.attributes)
            ? (extraParams.attribute || extraParams.attributes).toUpperCase().trim()
            : null;

        if (searchAttr) {
            searchAttr = searchAttr.replace(/\s+/g, '+');
        }
    
        // If auctions are bucketed by attrKey, process each bucket.
        if (typeof currentAuctions === 'object' && !Array.isArray(currentAuctions)) {
            enrichedAuctions = {};
            for (const bucketKey in currentAuctions) {
                // Remove numeric level details from the bucket key. - "MAGIC_FIND;10+VETERAN;10" becomes "MAGIC_FIND+VETERAN".
                const sanitizedBucketKey = bucketKey.replace(/;\d+/g, '');
                // If a search term is provided, skip buckets that don't match.
                if (searchAttr && !sanitizedBucketKey.includes(searchAttr)) {
                    continue;
                }
                const bucket = currentAuctions[bucketKey];
                const avgPrice = bucket.map(a => a.auctionRecord.price).reduce((sum, p) => sum + p, 0) / bucket.length || "Null";
    
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
    
        // Optionally, should we need to, include the overall average price for the item regardless of extraAtrrs.
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
    getAuctionsByAttribute(attribute, level, piece = null, onwards = false, shard = false) {
        const allItems = this.currentManager.rawStorage.dataByItem;
        const reqAttr = attribute.toUpperCase().trim();
        const reqLevel = parseFloat(level);
    
        // Mapping of Kuudra pieces to prefixes. ?piece=kuudra_boots -> [aurora_boots, fervor_boots, ...]
        const types = ["boots", "leggings", "chestplate", "helmet"];
        const prefixes = ["aurora", "fervor", "crimson", "hollow", "terror"];
        
        const kuudraMapping = Object.fromEntries(
            types.map(type => [
                `kuudra_${type}`,
                prefixes.map(prefix => `${prefix}_${type}`)
            ])
        );
        
    
        let allowedPieces = null;
        let exactPiece = null;
        if (piece) {
            const pieceLower = piece.toLowerCase();
            if (kuudraMapping[pieceLower]) {
                allowedPieces = kuudraMapping[pieceLower].map(p => p.toLowerCase());
            } else {
                exactPiece = pieceLower;
            }
        }
    
        const aggregatedAuctions = [];
        let totalPrice = 0;
        let totalCount = 0;
    
        for (const itemName in allItems) {
            const buckets = allItems[itemName];
            for (const bucketKey in buckets) {
                const segments = bucketKey.split('+');
                let matched = false;
                let matchedLevel = null;

                for (let i = 0; i < segments.length; i++) {
                    const parts = segments[i].split(';');
                    if (parts.length !== 2) continue;
                    const attr = parts[0].toUpperCase().trim();
                    const lvl = parseFloat(parts[1]);
                    if (attr === reqAttr) {
                        if (onwards ? (lvl >= reqLevel) : (lvl === reqLevel)) {
                            matched = true;
                            matchedLevel = lvl;
                            break;
                        }
                    }
                }

                if (matched) {
                    const bucket = buckets[bucketKey];
                    for (let j = 0; j < bucket.length; j++) {
                        const auction = bucket[j];
                        
                        if (piece) {
                            console.log(auction);
                            const auctionPiece = auction.auctionRecord?.piece || auction.itemName;
                            if (!auctionPiece) continue;
                            const auctionPieceLower = auctionPiece.toLowerCase();
                            // Ultimately, we want to filter by the exact piece and/ or include shards.
                            if (shard && auctionPieceLower === "attribute_shard") {
                            } else if (allowedPieces) {
                                if (!allowedPieces.includes(auctionPieceLower)) {
                                    continue;
                                }
                            } else if (exactPiece) {
                                if (auctionPieceLower !== exactPiece) {
                                    continue;
                                }
                            }
                        }
                        
                        const price = auction.auctionRecord?.price || 0;
                        aggregatedAuctions.push({
                            uuid: auction.auctionRecord?.uuid || "",
                            price,
                            level: matchedLevel
                        });
                        totalPrice += price;
                        totalCount++;
                    }
                }
            }
        }
        
        // Sort auctions by price. Level is not guaranteed to be sorted. ?onwards=false
        aggregatedAuctions.sort((a, b) => a.price - b.price);
        const avgPrice = totalCount ? totalPrice / totalCount : null;
    
        return { auctions: aggregatedAuctions, avgPrice };
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
        const reqRarity = extraParams.rarity ? extraParams.rarity.toUpperCase().trim() : null;
        const reqName = extraParams.name ? extraParams.name.toUpperCase().trim() : null;
        // Only parse reqLevel if provided; otherwise, leave as null.
        const reqLevel = extraParams.level ? parseFloat(extraParams.level) : null;
        const filterCandied = extraParams.candied === 'true';
    
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
            // If reqLevel is not provided, we assume the bucket should match without a level filter.
            if (reqLevel === null) {
                bucketMatches = true;
            } else if (bucketRange.includes("-")) {
                const [low, high] = bucketRange.split("-").map(Number);
                if (reqLevel >= low && reqLevel <= high) {
                    bucketMatches = true;
                }
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
    
            const enhancedAuctions = bucket.map(a => ({
                uuid: a.auctionRecord && a.auctionRecord.uuid ? a.auctionRecord.uuid : "",
                price: a.auctionRecord && a.auctionRecord.price ? a.auctionRecord.price : 0,
                petLevel: a.petInfo ? a.petInfo.petLevel : null,
                isCandied: a.petInfo ? a.petInfo.isCandied : false
            }));
    
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
