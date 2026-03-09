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
        const { addresses } = req.body;

        const launch = await prisma.launch.findUnique({ where: { id: launchId } });
        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        if (launch.creatorId !== req.userId) {
            res.status(403).json({ error: "Forbidden: Not Creator" });
            return;
        }

        if (!addresses || !Array.isArray(addresses)) {
            res.status(400).json({ error: "Missing or invalid addresses array" });
            return;
        }

        const uniqueAddresses = Array.from(new Set(addresses));
        const { count } = await prisma.whitelist.createMany({
            data: uniqueAddresses.map((address: string) => ({ address, launchId })),
            skipDuplicates: true
        });

        const total = await prisma.whitelist.count({ where: { launchId } });
        res.status(200).json({ added: count, total });
    } catch (error) {
        console.error("Whitelist POST Error:", error);
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

        const whitelists = await prisma.whitelist.findMany({ where: { launchId } });
        const addresses = whitelists.map(w => w.address);

        res.status(200).json({ addresses, total: addresses.length });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

router.delete("/:address", authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const launchId = parseInt(req.params.id);
        if (isNaN(launchId)) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }
        const address = req.params.address;

        const launch = await prisma.launch.findUnique({ where: { id: launchId } });

        if (!launch) {
            res.status(404).json({ error: "Launch not found" });
            return;
        }

        if (launch.creatorId !== req.userId) {
            res.status(403).json({ error: "Forbidden: Not Creator" });
            return;
        }

        const deleted = await prisma.whitelist.deleteMany({
            where: {
                launchId,
                address
            }
        });

        if (deleted.count > 0) {
            res.status(200).json({ removed: true });
        } else {
            res.status(404).json({ error: "Address not found in whitelist" });
        }
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
