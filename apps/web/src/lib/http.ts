export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const unauthorized = () => json({ error: "Unauthorized" }, 401);
export const badRequest = (error: unknown) => json({ error }, 400);
