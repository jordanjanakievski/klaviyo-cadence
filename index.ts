import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import eventsRouter from "./src/routes/events";
import dashboardRouter from "./src/routes/dashboard";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.resolve(process.cwd(), "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", eventsRouter);
app.use("/dashboard", dashboardRouter);

app.get("/", (req: Request, res: Response) => {
    res.send("Klaviyo Integration is running");
});

app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
