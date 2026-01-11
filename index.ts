import express, {Express, Request, Response} from 'express';
import dotenv from 'dotenv';
import eventsRouter from './src/routes/events';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use('/api', eventsRouter);

app.get('/', (req: Request, res: Response) => {
  res.send('Klaviyo Integration is running');
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
