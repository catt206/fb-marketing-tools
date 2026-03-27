import { Router } from "express";
import { z } from "zod";
import { ContentTemplateModel } from "../models/ContentTemplate.js";
import { spinText } from "../services/spintax.js";
import { writeAuditLog } from "../services/audit.js";
const createTemplateSchema = z.object({
    name: z.string().min(1).max(200),
    text: z.string().min(1).max(5000),
    imageUrl: z.string().url().optional()
});
const updateTemplateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    text: z.string().min(1).max(5000).optional(),
    imageUrl: z.string().url().nullable().optional()
});
const spinSchema = z.object({
    text: z.string().min(1).max(5000)
});
const listQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(200).optional(),
    cursor: z.string().min(1).optional()
});
export function templatesRoutes(_params) {
    const router = Router();
    router.get("/", async (req, res, next) => {
        try {
            const authReq = req;
            const query = listQuerySchema.parse(req.query);
            const limit = query.limit ?? 50;
            const filter = { userId: authReq.auth.userId };
            if (query.cursor) {
                filter._id = { $lt: query.cursor };
            }
            const templates = await ContentTemplateModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
            const nextCursor = templates.length > 0 ? templates[templates.length - 1]._id.toString() : null;
            res.json({ templates, nextCursor });
        }
        catch (err) {
            next(err);
        }
    });
    router.post("/", async (req, res, next) => {
        try {
            const authReq = req;
            const body = createTemplateSchema.parse(req.body);
            const created = await ContentTemplateModel.create({ ...body, userId: authReq.auth.userId });
            await writeAuditLog({
                env: _params.env,
                userId: authReq.auth.userId,
                requestId: req.ctx?.requestId,
                action: "TEMPLATE_CREATE",
                status: "SUCCESS",
                entityType: "ContentTemplate",
                entityId: created._id.toString(),
                metadata: { name: body.name }
            });
            res.status(201).json({ template: created.toJSON() });
        }
        catch (err) {
            next(err);
        }
    });
    router.put("/:id", async (req, res, next) => {
        try {
            const authReq = req;
            const body = updateTemplateSchema.parse(req.body);
            const update = {};
            if (body.name !== undefined)
                update.name = body.name;
            if (body.text !== undefined)
                update.text = body.text;
            if (body.imageUrl !== undefined)
                update.imageUrl = body.imageUrl ?? undefined;
            const template = await ContentTemplateModel.findOneAndUpdate({ _id: req.params.id, userId: authReq.auth.userId }, { $set: update }, { new: true }).lean();
            if (!template) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            res.json({ template });
        }
        catch (err) {
            next(err);
        }
    });
    router.delete("/:id", async (req, res, next) => {
        try {
            const authReq = req;
            const result = await ContentTemplateModel.deleteOne({ _id: req.params.id, userId: authReq.auth.userId });
            if (result.deletedCount === 0) {
                res.status(404).json({ error: "NOT_FOUND" });
                return;
            }
            await writeAuditLog({
                env: _params.env,
                userId: authReq.auth.userId,
                requestId: req.ctx?.requestId,
                action: "TEMPLATE_DELETE",
                status: "SUCCESS",
                entityType: "ContentTemplate",
                entityId: req.params.id
            });
            res.status(204).end();
        }
        catch (err) {
            next(err);
        }
    });
    router.post("/spin/preview", async (req, res, next) => {
        try {
            const body = spinSchema.parse(req.body);
            const result = spinText(body.text);
            res.json({ result });
        }
        catch (err) {
            next(err);
        }
    });
    return router;
}
