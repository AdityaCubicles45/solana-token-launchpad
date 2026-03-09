import { Router, Request, Response } from "express";
import { prisma } from "../prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

export function getLaunchStatus(launch: any): string {
    const totalPurchased = launch.purchases?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0;
    return getStatus(launch, totalPurchased);
}

export function getStatus(launch: any, totalPurchased: number): string {
    const now = new Date();
    if (totalPurchased >= launch.totalSupply) return "SOLD_OUT";
    if (now < new Date(launch.startsAt)) return "UPCOMING";
    if (now > new Date(launch.endsAt)) return "ENDED";
    return "ACTIVE";
}

router.post("/", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = req.body;

        if (!name || !symbol || totalSupply === undefined || pricePerToken === undefined || !startsAt || !endsAt || maxPerWallet === undefined) {
            res.status(400).json({ error: "Missing fields" });
            return;
        }

        const launch = await prisma.launch.create({
            data: {
                name,
                symbol,
                totalSupply,
                pricePerToken,
                startsAt: new Date(startsAt),
                endsAt: new Date(endsAt),
                maxPerWallet,
                description,
                creatorId: req.userId!,
                ...(tiers && tiers.length > 0 && {
                    tiers: {
                        create: tiers.map((t: any) => ({
                            minAmount: t.minAmount,
                            maxAmount: t.maxAmount,
                            pricePerToken: t.pricePerToken
                        }))
                    }
                }),
                ...(vesting && {
                    vesting: {
                        create: {
                            cliffDays: vesting.cliffDays,
                            vestingDays: vesting.vestingDays,
                            tgePercent: vesting.tgePercent
                        }
                    }
                })
            },
            include: {
                purchases: { select: { amount: true } },
                tiers: true,
                vesting: true
            }
        });

        const status = getLaunchStatus(launch);
        const { purchases, ...launchData } = launch;

        res.status(201).json({ ...launchData, status });
    } catch (error) {
        console.error("Create Launch Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const statusFilter = req.query.status as string;

        const skip = (page - 1) * limit;

        const dbLaunches = await prisma.launch.findMany({
            include: {
                purchases: { select: { amount: true } }
            },
            orderBy: { createdAt: "desc" }
        });

        let launchesRaw = dbLaunches.map(l => {
            const status = getLaunchStatus(l);
            const { purchases, ...launchData } = l;
            return { ...launchData, status };
        });

        if (statusFilter) {
            launchesRaw = launchesRaw.filter(l => l.status === statusFilter);
        }

        const total = launchesRaw.length;
        const launches = launchesRaw.slice(skip, skip + limit);

        res.status(200).json({
            launches,
            total,
            page,
            limit
        });
    } catch (error) {
        console.error("Get Launches Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", async (req: Request, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const launch = await prisma.launch.findUnique({
            where: { id: launchId },
            include: {
                purchases: { select: { amount: true } },
                tiers: true,
                vesting: true
            }
        });

        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        const status = getLaunchStatus(launch);
        const { purchases, ...launchData } = launch;

        res.status(200).json({ ...launchData, status });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/:id", authenticate, async (req: AuthRequest, res: Response) => {
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
            res.status(403).json({ error: "Forbidden" });
            return;
        }

        const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description } = req.body;
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (symbol !== undefined) data.symbol = symbol;
        if (totalSupply !== undefined) data.totalSupply = totalSupply;
        if (pricePerToken !== undefined) data.pricePerToken = pricePerToken;
        if (startsAt !== undefined) data.startsAt = new Date(startsAt);
        if (endsAt !== undefined) data.endsAt = new Date(endsAt);
        if (maxPerWallet !== undefined) data.maxPerWallet = maxPerWallet;
        if (description !== undefined) data.description = description;

        const updated = await prisma.launch.update({
            where: { id: launchId },
            data,
            include: {
                purchases: { select: { amount: true } },
                tiers: true,
                vesting: true
            }
        });

        const status = getLaunchStatus(updated);
        const { purchases, ...launchData } = updated;

        res.status(200).json({ ...launchData, status });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
