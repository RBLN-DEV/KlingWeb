import { Router, Request, Response } from 'express';
import { getKlingService } from '../services/kling.service.js';

const router = Router();

/**
 * GET /api/account/costs
 * Retorna dados de uso/créditos da conta Kling
 * Query params opcionais: start_time, end_time, resource_pack_name
 */
router.get('/costs', async (req: Request, res: Response) => {
    try {
        const { start_time, end_time, resource_pack_name } = req.query;

        const startTime = start_time ? Number(start_time) : undefined;
        const endTime = end_time ? Number(end_time) : undefined;
        const packName = resource_pack_name ? String(resource_pack_name) : undefined;

        const klingService = getKlingService();
        const data = await klingService.getAccountCosts(startTime, endTime, packName);

        res.json({
            success: true,
            data,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro ao buscar dados da conta';
        console.error('[Account] Erro:', message);
        res.status(500).json({
            success: false,
            error: message,
        });
    }
});

export default router;
