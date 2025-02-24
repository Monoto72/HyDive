import axios from 'axios';
import NBT from 'prismarine-nbt';
import { getPetBucket, computePetLevel } from '../helpers/petUtils.js'; // adjust the path as needed

export class AuctionManagerBase {
    async fetchAuctions(url) {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data;
        } catch (error) {
            console.error(`Error fetching auctions from ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * Parses a single auction object to extract relevant auction and item details.
     *
     * - For pet items, the method parses the pet information JSON, calculates the pet's bucket and level, 
     *   and checks if candy has been used.
     * - For normal items with attributes, it constructs a sorted attribute key.
     * - If attributes are missing, it returns the basic auction record.
     *
     * If any errors occur during NBT parsing or pet info processing, the error is logged and the function returns null.
     *
     * @param {Object} auction - The auction object to parse.
     * @param {boolean} auction.bin - Indicates if the auction is a Buy-It-Now auction.
     * @param {string} auction.item_bytes - Base64 encoded string representing the item's NBT data.
     * @param {number} auction.price - The BIN price of the auction.
     * @param {number} auction.starting_bid - The starting bid price, used if the BIN price is invalid.
     * @param {string} auction.uuid - A unique identifier for the auction.
     * @returns {Promise<Object|null>} A promise that resolves with an object containing parsed auction details or null if parsing fails.
     */
    async parseAuction(auction) {
        if (!auction.bin) return null;
    
        const buffer = Buffer.from(auction.item_bytes, 'base64');
        let nbtData;
        try {
            nbtData = await NBT.parse(buffer);
        } catch (e) {
            console.error(`Error parsing NBT for auction ${auction.uuid}:`, e);
            return null;
        }
    
        const itemInfo = nbtData.parsed.value.i.value.value[0];
        const extraAttrs = itemInfo.tag.value.ExtraAttributes.value;
        const itemNameOriginal = extraAttrs.id.value;
    
        const hasValidPrice = typeof auction.price === 'number' && auction.price > 0 && auction.price !== 888;
        const price = hasValidPrice ? auction.price : auction.starting_bid; // Use starting bid if BIN price is invalid and/ or and ended auction - Useless JSON
    
        const auctionRecord = {
            price,
            uuid: auction.uuid,
        };
    
        // Pet Items
        if (extraAttrs.petInfo) {
            let petInfo;
            try {
                petInfo = JSON.parse(extraAttrs.petInfo.value);
            } catch (e) {
                console.error(`Error parsing petInfo for auction ${auction.uuid}:`, e);
                return null;
            }
    
            const petBucket = getPetBucket(petInfo);
            const petLevel = computePetLevel(petInfo);
            const isCandied = petInfo.candyUsed && parseFloat(petInfo.candyUsed) > 0; // Fucking phycopaths

            return {
                itemName: "PETS",
                auctionRecord,
                attrKey: petBucket,
                petInfo: {
                    ...petInfo,
                    petLevel,
                    isCandied,
                }
            };
        }
    
        // Normal Items - With Atributes
        // todo: add Enrichment filters
        if (extraAttrs.attributes) {
            const attrs = extraAttrs.attributes.value;
            const attrEntries = Object.entries(attrs).map(([attr, attrData]) => {
                return `${attr.toUpperCase()};${String(attrData.value).trim()}`;
            });
            const attrKey = attrEntries.sort().join('+');
            return {
                itemName: itemNameOriginal,
                auctionRecord,
                attrKey
            };
        } else {
            return {
                itemName: itemNameOriginal,
                auctionRecord
            };
        }
    }
}
