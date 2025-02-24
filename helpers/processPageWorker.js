import {
    parentPort,
    workerData
} from 'worker_threads';
import {
    AuctionManagerBase
} from '../AuctionData/AuctionManagerBase.js';

const auctionBase = new AuctionManagerBase();

// Higher some coal miners to get this done faster
(async () => {
    const rawPage = workerData.pageData;
    const parsedAuctions = [];

    if (rawPage && Array.isArray(rawPage.auctions)) {
        for (const auction of rawPage.auctions) {
            try {
                const parsed = await auctionBase.parseAuction(auction);
                if (parsed) parsedAuctions.push(parsed);
            } catch (e) {
                console.error(`Error parsing auction ${auction.uuid}:`, e);
            }
        }
    }

    parentPort.postMessage(parsedAuctions);
})();