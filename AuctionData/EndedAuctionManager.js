import { CronJob } from 'cron';
import { AuctionManagerBase } from './AuctionManagerBase.js';
import { RawAuctionStorage } from './RawAuctionStorage.js';

export class EndedAuctionManager extends AuctionManagerBase {
    constructor() {
        super();
        this.rawStorage = new RawAuctionStorage();

        this.job = new CronJob('0 * * * * *', () => {
            this.processEndedAuctions();
        });

        this.job.start();
    }

    async fetchEndedAuctions() {
        const url = `https://api.hypixel.net/v2/skyblock/auctions_ended`;
        return this.fetchAuctions(url);
    }

    async processEndedAuctions() {
        const data = await this.fetchEndedAuctions();
        if (!data || !data.auctions) return;

        for (const auction of data.auctions) {
            const parsed = await this.parseAuction(auction);
            if (!parsed) continue;

            this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey);
        }
        console.log('Processed ended auctions.');
    }

    // Does what bucketAverages does, but for bigger data sets.
    computeAvgPrice(itemName) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return null;

        // Bucket keys are Atrr
        if (!Array.isArray(auctions)) {
            let total = 0,
                count = 0;
            Object.values(auctions).forEach(bucket => {
                bucket.forEach(a => {
                    total += a.auctionRecord.price;
                    count++;
                });
            });
            return count > 0 ? total / count : null;
        }

        // Simple array of auctions.
        const total = auctions.reduce((sum, a) => sum + a.price, 0);
        return total / auctions.length;
    }

    // Grabs specific buckets for a given item and computes the average. Realistically, you should wait for 15 entries to rely on.
    computeBucketAverages(itemName) {
        const auctions = this.rawStorage.getAuctions(itemName);
        if (!auctions) return null;

        const bucketAverages = {};
        if (!Array.isArray(auctions)) {
            // Auctions are stored by bucket (attrKey).
            for (const bucketKey in auctions) {
                const bucket = auctions[bucketKey];
                const total = bucket.reduce((sum, a) => sum + a.auctionRecord.price, 0);
                bucketAverages[bucketKey] = bucket.length > 0 ? total / bucket.length : 0;
            }
        } else {
            // Single bucket case; we use a default key.
            const total = auctions.reduce((sum, a) => sum + a.price, 0);
            bucketAverages['default'] = auctions.length > 0 ? total / auctions.length : 0;
        }
        return bucketAverages;
    }

    // Returns an object with per-bucket average prices for each item.
    getAllAverages() {
        const averages = {};
        for (const itemName in this.rawStorage.dataByItem) {
            const bucketAverages = this.computeBucketAverages(itemName);
            if (bucketAverages !== null) {
                const keys = Object.keys(bucketAverages);
                if (keys.length === 1 && keys[0] === "default") {
                    averages[itemName] = bucketAverages["default"];
                } else {
                    averages[itemName] = bucketAverages;
                }
            }
        }
        return averages;
    }
    
}
