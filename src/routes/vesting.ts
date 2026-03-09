import { Router, Request, Response } from "express";
import { prisma } from "../prisma";

import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router({ mergeParams: true });

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const walletAddress = req.query.walletAddress as string;

        if (!walletAddress) {
            res.status(400).json({ error: "Missing walletAddress" });
            return;
        }

        const launch = await prisma.launch.findUnique({
            where: { id: launchId },
            include: { vesting: true }
        });

        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        const purchases = await prisma.purchase.findMany({
            where: { launchId, walletAddress }
        });

        const totalPurchased = purchases.reduce((sum, p) => sum + p.amount, 0);

        let tgeAmount = 0;
        let cliffEndsAt = null;
        let vestedAmount = 0;
        let lockedAmount = 0;
        let claimableAmount = 0;

        const now = new Date();

        if (!launch.vesting) {
            tgeAmount = totalPurchased;
            vestedAmount = totalPurchased;
            claimableAmount = totalPurchased;
            lockedAmount = 0;
        } else {
            tgeAmount = Math.floor(totalPurchased * (launch.vesting.tgePercent / 100));
            cliffEndsAt = new Date(launch.endsAt.getTime() + launch.vesting.cliffDays * 24 * 60 * 60 * 1000);
            const vestingEndsAt = new Date(cliffEndsAt.getTime() + launch.vesting.vestingDays * 24 * 60 * 60 * 1000);

            if (now >= launch.endsAt) {
                vestedAmount += tgeAmount;

                if (now >= cliffEndsAt) {
                    if (now >= vestingEndsAt) {
                        vestedAmount = totalPurchased;
                    } else {
                        const msPassed = now.getTime() - cliffEndsAt.getTime();
                        const msTotal = vestingEndsAt.getTime() - cliffEndsAt.getTime();
                        if (msTotal > 0) {
                            const linearAmount = totalPurchased - tgeAmount;
                            vestedAmount += Math.floor(linearAmount * (msPassed / msTotal));
                        }
                    }
                }
            } else {
                // TGE is usually after launch ends
                vestedAmount = 0;
            }

            claimableAmount = vestedAmount;
            lockedAmount = totalPurchased - vestedAmount;
        }

        res.status(200).json({
            totalPurchased,
            tgeAmount,
            cliffEndsAt,
            vestedAmount,
            lockedAmount,
            claimableAmount
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
