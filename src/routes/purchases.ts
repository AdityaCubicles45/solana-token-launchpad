import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";
import { getLaunchStatus } from "./launches";

const router = Router({ mergeParams: true });

router.post("/purchase", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const { walletAddress, amount, txSignature, referralCode } = req.body;

        if (!walletAddress || !amount || !txSignature) {
            res.status(400).json({ error: "Missing fields" });
            return;
        }

        const launch = await prisma.launch.findUnique({
            where: { id: launchId },
            include: {
                purchases: true,
                tiers: true,
                whitelist: true
            }
        });

        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        // Checking Launch active status
        const totalPurchased = launch.purchases.reduce((sum, p) => sum + p.amount, 0);
        const status = getLaunchStatus(launch);
        if (status !== "ACTIVE") {
            res.status(400).json({ error: `Launch is not ACTIVE. Current status: ${status}` });
            return;
        }

        // Whitelist check
        if (launch.whitelist.length > 0) {
            const isWhitelisted = launch.whitelist.some(w => w.address === walletAddress);
            if (!isWhitelisted) {
                res.status(400).json({ error: "Not whitelisted" });
                return;
            }
        }

        // Supply check
        if (totalPurchased + amount > launch.totalSupply) {
            res.status(400).json({ error: "Exceeds total supply" });
            return;
        }

        // Max Per Wallet Per User check
        const userPurchases = launch.purchases.filter(p => p.userId === req.userId);
        const userTotalPurchased = userPurchases.reduce((sum, p) => sum + p.amount, 0);
        if (userTotalPurchased + amount > launch.maxPerWallet) {
            res.status(400).json({ error: "Exceeds maxPerWallet for user" });
            return;
        }

        // Tx duplicate block
        const existingTx = await prisma.purchase.findUnique({ where: { txSignature } });
        if (existingTx) {
            res.status(400).json({ error: "Duplicate txSignature" });
            return;
        }

        let referral = null;
        if (referralCode) {
            referral = await prisma.referralCode.findFirst({
                where: { launchId, code: referralCode }
            });
            if (!referral) {
                res.status(400).json({ error: "Invalid referral code" });
                return;
            }
            if (referral.usedCount >= referral.maxUses) {
                res.status(400).json({ error: "Referral code exhausted" });
                return;
            }
        }

        // Calculate cost
        let totalCost = 0;
        let remainingAmount = amount;
        let currentGlobal = totalPurchased;

        if (launch.tiers.length > 0) {
            const sortedTiers = launch.tiers.sort((a, b) => a.minAmount - b.minAmount);

            for (const tier of sortedTiers) {
                if (remainingAmount <= 0) break;
                if (currentGlobal >= tier.maxAmount) continue;

                const availableInTier = tier.maxAmount - Math.max(currentGlobal, tier.minAmount);
                const take = Math.min(availableInTier, remainingAmount);

                totalCost += take * tier.pricePerToken;
                remainingAmount -= take;
                currentGlobal += take;
            }
        }

        if (remainingAmount > 0) {
            totalCost += remainingAmount * launch.pricePerToken;
        }

        if (referral) {
            totalCost = totalCost * (1 - referral.discountPercent / 100);
        }

        // Execute in transaction
        const purchase = await prisma.$transaction(async (tx) => {
            const p = await tx.purchase.create({
                data: {
                    walletAddress,
                    amount,
                    totalCost,
                    txSignature,
                    userId: req.userId!,
                    launchId,
                    ...(referral && { referralCodeId: referral.id })
                }
            });

            if (referral) {
                await tx.referralCode.update({
                    where: { id: referral.id },
                    data: { usedCount: { increment: 1 } }
                });
            }

            return p;
        });

        res.status(201).json(purchase);
    } catch (error: any) {
        if (error.code === 'P2002') {
            res.status(400).json({ error: "Duplicate txSignature" });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/purchases", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const launch = await prisma.launch.findUnique({ where: { id: launchId } });

        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        const isCreator = launch.creatorId === req.userId;

        const whereClause: any = { launchId };
        if (!isCreator) {
            whereClause.userId = req.userId;
        }

        const purchases = await prisma.purchase.findMany({ where: whereClause });

        res.status(200).json({ purchases, total: purchases.length });

    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
