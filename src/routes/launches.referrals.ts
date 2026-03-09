import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router({ mergeParams: true });

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const { code, discountPercent, maxUses } = req.body;

        const launch = await prisma.launch.findUnique({ where: { id: launchId } });
        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        if (launch.creatorId !== req.userId) {
            res.status(403).json({ error: "Forbidden: Not Creator" });
            return;
        }

        const referral = await prisma.referralCode.create({
            data: {
                code,
                discountPercent,
                maxUses,
                launchId
            }
        });

        res.status(201).json({
            id: referral.id,
            code: referral.code,
            discountPercent: referral.discountPercent,
            maxUses: referral.maxUses,
            usedCount: referral.usedCount
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            res.status(409).json({ error: "Duplicate code for this launch" });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
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

        if (launch.creatorId !== req.userId) {
            res.status(403).json({ error: "Forbidden: Not Creator" });
            return;
        }

        const referrals = await prisma.referralCode.findMany({ where: { launchId } });
        res.status(200).json(referrals);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
