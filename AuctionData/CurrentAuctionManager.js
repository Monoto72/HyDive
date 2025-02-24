import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { CronJob } from 'cron';
import { AuctionManagerBase } from './AuctionManagerBase.js';
import { RawAuctionStorage } from './RawAuctionStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CurrentAuctionManager extends AuctionManagerBase {
    /**
     * @param {EndedAuctionManager} endedManager
     */
    constructor(endedManager) {
        super();
        this.endedManager = endedManager;
        this.rawStorage = new RawAuctionStorage();
        this.auctionCache = [];
        this.lastUpdate = null;

        // Optionally schedule periodic updates (every minute)
        this.job = new CronJob('0 * * * * *', () => {
            this.updateAuctionCache();
        });
    }

    async fetchCurrentAuctions(page = 1) {
        const url = `https://api.hypixel.net/v2/skyblock/auctions?page=${page}`;
        return this.fetchAuctions(url);
    }

    async processCurrentAuctions() {
        // Process current auctions from page 1 (if needed separately)
        const data = await this.fetchCurrentAuctions(1);
        if (!data || !data.auctions) return;

        for (const auction of data.auctions) {
            const parsed = await this.parseAuction(auction);
            if (!parsed) continue;

            this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });
        }
    }

    runWorker(workerPayload) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(
                path.join(__dirname, '../helpers/processPageWorker.js'),
                {
                    workerData: workerPayload
                }
            );
            worker.on('message', (result) => resolve(result));
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    async updateAuctionCache() {
        try {
            this.rawStorage.dataByItem = {}; // Clear the raw storage every minute.
            this.auctionCache = [];

            // Process page 1 and get return total pages.
            const firstPageData = await this.fetchCurrentAuctions(1);
            if (!firstPageData || !firstPageData.auctions) return;

            let aggregatedAuctions = [];

            for (const auction of firstPageData.auctions) {
                const parsed = await this.parseAuction(auction);
                if (!parsed) continue;

                this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });
                aggregatedAuctions.push(parsed);
            }

            const totalPages = firstPageData.totalPages - 1 || 1;

            const limit = pLimit(5); // Cool ass multi-threading lib
            const workerPromises = [];

            // Send workers to work
            for (let page = 2; page <= totalPages; page++) {
                workerPromises.push(
                    limit(async () => {
                        const pageData = await this.fetchCurrentAuctions(page);
                        if (pageData) {
                            const avgPriceData = this.endedManager.getAllAverages();
                            return this.runWorker({ pageData, avgPriceData });
                        }
                        return [];
                    })
                );
            }

            // Workers come home from a hard day at the coal mines
            const workerResultsArrays = await Promise.all(workerPromises);
            workerResultsArrays.forEach((resultsArray) => {
                aggregatedAuctions = aggregatedAuctions.concat(resultsArray);
                resultsArray.forEach(parsed => {

                    this.rawStorage.addAuction(parsed.itemName, parsed, parsed.attrKey, { limited: false });
                });
            });

            this.auctionCache = aggregatedAuctions;
            this.lastUpdate = new Date();
            console.log(`Current auction cache updated at ${this.lastUpdate} with ${aggregatedAuctions.length} auctions.`);
        } catch (error) {
            console.error("Error updating current auction cache:", error);
        }
    }

}
