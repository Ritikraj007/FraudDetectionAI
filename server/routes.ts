import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { threatAnalysisService } from "./services/threatAnalysis";
import { mockDataGenerator } from "./services/mockData";
import { fraudAnalysisService } from "./services/fraudAnalysis";
import { AnomalyDetectionService } from "./services/anomalyDetection.js";
import { CSVImportService } from "./services/csvImport.js";
import { z } from "zod";
import multer from "multer";

export async function registerRoutes(app: Express): Promise<Server> {
  // Start mock data generation
  mockDataGenerator.start();
  
  // Initialize services
  const anomalyDetectionService = new AnomalyDetectionService(storage);
  const csvImportService = new CSVImportService(storage);
  
  // Configure multer for file uploads
  const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getThreatStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });

  app.get("/api/threats", async (req, res) => {
    try {
      const { limit = 100, offset = 0, severity, type, timeRange } = req.query;
      
      // Get all threats first
      let threats = await storage.getThreats(Number(limit), Number(offset));
      
      // Apply time range filter first if specified
      if (timeRange && typeof timeRange === 'string') {
        const now = new Date();
        let startTime = new Date();
        
        switch (timeRange) {
          case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '6hours':
            startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            break;
          case '24hours':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
        }
        
        threats = threats.filter(threat => {
          const threatTime = new Date(threat.timestamp);
          return threatTime >= startTime && threatTime <= now;
        });
      }
      
      // Apply severity filter if specified
      if (severity && typeof severity === 'string' && severity !== 'all') {
        threats = threats.filter(threat => threat.severity === severity);
      }
      
      // Apply threat type filter if specified
      if (type && typeof type === 'string' && type !== 'all') {
        threats = threats.filter(threat => threat.threatType === type);
      }
      
      res.json(threats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get threats" });
    }
  });

  app.get("/api/threats/:id", async (req, res) => {
    try {
      const threat = await storage.getThreatById(Number(req.params.id));
      if (!threat) {
        return res.status(404).json({ error: "Threat not found" });
      }
      res.json(threat);
    } catch (error) {
      res.status(500).json({ error: "Failed to get threat" });
    }
  });

  app.patch("/api/threats/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const threat = await storage.updateThreatStatus(Number(req.params.id), status);
      if (!threat) {
        return res.status(404).json({ error: "Threat not found" });
      }
      res.json(threat);
    } catch (error) {
      res.status(500).json({ error: "Failed to update threat status" });
    }
  });

  app.get("/api/actions", async (req, res) => {
    try {
      const { threatId, limit = 50 } = req.query;
      
      let actions;
      if (threatId) {
        actions = await storage.getActionsByThreatId(Number(threatId));
      } else {
        actions = await storage.getRecentActions(Number(limit));
      }
      
      res.json(actions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get actions" });
    }
  });

  app.post("/api/actions", async (req, res) => {
    try {
      const actionData = req.body;
      const action = await storage.createAction(actionData);
      res.json(action);
    } catch (error) {
      res.status(500).json({ error: "Failed to create action" });
    }
  });

  app.get("/api/fraud-cases", async (req, res) => {
    try {
      const { userId } = req.query;
      
      let fraudCases;
      if (userId && typeof userId === 'string') {
        fraudCases = await storage.getFraudCasesByUserId(userId);
      } else {
        fraudCases = await storage.getFraudCases();
      }
      
      res.json(fraudCases);
    } catch (error) {
      res.status(500).json({ error: "Failed to get fraud cases" });
    }
  });

  app.get("/api/system-config", async (req, res) => {
    try {
      const { key } = req.query;
      
      if (key && typeof key === 'string') {
        const config = await storage.getSystemConfig(key);
        res.json(config);
      } else {
        // Return all configs
        const configs = {
          sms_sensitivity: await storage.getSystemConfig('sms_sensitivity'),
          call_sensitivity: await storage.getSystemConfig('call_sensitivity'),
          fraud_sensitivity: await storage.getSystemConfig('fraud_sensitivity'),
          auto_block_critical: await storage.getSystemConfig('auto_block_critical'),
          auto_block_fraud: await storage.getSystemConfig('auto_block_fraud'),
          sim_swap_manual: await storage.getSystemConfig('sim_swap_manual'),
        };
        res.json(configs);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to get system config" });
    }
  });

  app.patch("/api/system-config/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      const config = await storage.updateSystemConfig(key, value);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update system config" });
    }
  });

  app.get("/api/compliance-reports", async (req, res) => {
    try {
      const reports = await storage.getComplianceReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to get compliance reports" });
    }
  });

  app.post("/api/compliance-reports", async (req, res) => {
    try {
      const { reportType, startDate, endDate } = req.body;
      
      const summary = await threatAnalysisService.generateComplianceReport(
        new Date(startDate),
        new Date(endDate),
        reportType
      );
      
      res.json({ summary });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate compliance report" });
    }
  });

  // Export endpoints
  // Anomaly detection endpoints
  app.get("/api/anomalies", async (req, res) => {
    try {
      const config = await storage.getSystemConfig('sms_sensitivity');
      const smsSensitivity = config?.configValue || 75;
      const callConfig = await storage.getSystemConfig('call_sensitivity');
      const callSensitivity = callConfig?.configValue || 65;
      const fraudConfig = await storage.getSystemConfig('fraud_sensitivity');
      const fraudSensitivity = fraudConfig?.configValue || 80;
      
      const anomalies = await anomalyDetectionService.analyzeAnomalies({
        sms_sensitivity: Number(smsSensitivity) || 75,
        call_sensitivity: Number(callSensitivity) || 65,
        fraud_sensitivity: Number(fraudSensitivity) || 80
      });
      
      res.json(anomalies);
    } catch (error) {
      console.error("Error getting anomalies:", error);
      res.status(500).json({ error: "Failed to get anomalies" });
    }
  });

  app.get("/api/anomalies/statistical", async (req, res) => {
    try {
      const anomalies = await anomalyDetectionService.getStatisticalAnomalies();
      res.json(anomalies);
    } catch (error) {
      console.error("Error getting statistical anomalies:", error);
      res.status(500).json({ error: "Failed to get statistical anomalies" });
    }
  });

  app.post("/api/anomalies/analyze", async (req, res) => {
    try {
      const { sensitivity_config } = req.body;
      const anomalies = await anomalyDetectionService.analyzeAnomalies(sensitivity_config);
      res.json({ 
        success: true, 
        anomalies,
        message: "Anomaly analysis completed successfully"
      });
    } catch (error) {
      console.error("Error running anomaly analysis:", error);
      res.status(500).json({ error: "Failed to run anomaly analysis" });
    }
  });

  app.get("/api/export/threats", async (req, res) => {
    try {
      const threats = await storage.getThreats(1000);
      
      // Convert to CSV format
      const csvHeaders = 'Timestamp,Type,Source,Severity,AI Score,Status,Description\n';
      const csvRows = threats.map(threat => 
        `${threat.timestamp.toISOString()},${threat.threatType},${threat.source},${threat.severity},${threat.aiScore},${threat.status},"${threat.description || ''}"`
      ).join('\n');
      
      const csv = csvHeaders + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=threats.csv');
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export threats" });
    }
  });

  // Timeline data for D3.js visualization
  app.get("/api/threats/timeline", async (req, res) => {
    try {
      const { hours = 24 } = req.query;
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - Number(hours) * 60 * 60 * 1000);
      
      const threats = await storage.getThreatsInTimeRange(startTime, endTime);
      
      // Group threats by hour and severity
      const timelineData: any[] = [];
      const hourBuckets: { [key: string]: { critical: number; high: number; medium: number; low: number } } = {};
      
      threats.forEach(threat => {
        const hour = new Date(threat.timestamp);
        hour.setMinutes(0, 0, 0);
        const hourKey = hour.toISOString();
        
        if (!hourBuckets[hourKey]) {
          hourBuckets[hourKey] = { critical: 0, high: 0, medium: 0, low: 0 };
        }
        
        const severityKey = threat.severity as keyof typeof hourBuckets[typeof hourKey];
        hourBuckets[hourKey][severityKey]++;
      });
      
      Object.entries(hourBuckets).forEach(([hourKey, counts]) => {
        timelineData.push({
          timestamp: hourKey,
          ...counts,
          total: counts.critical + counts.high + counts.medium + counts.low
        });
      });
      
      timelineData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      res.json(timelineData);
    } catch (error) {
      res.status(500).json({ error: "Failed to get timeline data" });
    }
  });

  // Telecom user activity routes
  app.get("/api/telecom/activities", async (req, res) => {
    try {
      const { userId, limit = 100, offset = 0, timeRange } = req.query;
      const activities = await csvImportService.getTelecomActivities(
        userId as string,
        Number(limit),
        timeRange as string
      );
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to get telecom activities" });
    }
  });

  app.get("/api/telecom/fraud-activities", async (req, res) => {
    try {
      const fraudActivities = await csvImportService.getTelecomFraudActivities();
      res.json(fraudActivities);
    } catch (error) {
      res.status(500).json({ error: "Failed to get fraud activities" });
    }
  });

  app.get("/api/telecom/stats", async (req, res) => {
    try {
      const { timeRange } = req.query;
      const stats = await csvImportService.getTelecomActivityStats(timeRange as string);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to get telecom stats" });
    }
  });

  app.get("/api/telecom/user-risk/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const riskScore = await storage.getTelecomUserRiskScore(userId);
      res.json({ userId, riskScore });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user risk score" });
    }
  });

  app.get("/api/telecom/overall-risk", async (req, res) => {
    try {
      const riskScore = await storage.getTelecomOverallRiskScore();
      res.json({ riskScore });
    } catch (error) {
      res.status(500).json({ error: "Failed to get overall risk score" });
    }
  });

  // AI-powered fraud analysis using Gemini
  app.get("/api/telecom/fraud-analysis", async (req, res) => {
    try {
      const { userId } = req.query;
      const analysis = await fraudAnalysisService.analyzeUserActivity(userId as string);
      res.json(analysis);
    } catch (error) {
      console.error('Fraud analysis error:', error);
      res.status(500).json({ error: "Failed to perform fraud analysis" });
    }
  });

  app.post("/api/telecom/fraud-analysis", async (req, res) => {
    try {
      const { userId } = req.body;
      const analysis = await fraudAnalysisService.analyzeUserActivity(userId);
      res.json(analysis);
    } catch (error) {
      console.error('Fraud analysis error:', error);
      res.status(500).json({ error: "Failed to perform fraud analysis" });
    }
  });

  // CSV Data Import Routes
  app.get("/api/data-import/status", async (req, res) => {
    try {
      const source = csvImportService.getCurrentDataSource();
      res.json({ source });
    } catch (error) {
      res.status(500).json({ error: "Failed to get data source status" });
    }
  });

  app.get("/api/data-import/files", async (req, res) => {
    try {
      const files = csvImportService.getUploadedFiles();
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: "Failed to get uploaded files" });
    }
  });

  app.post("/api/data-import/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const result = await csvImportService.uploadCSV(req.file.originalname, req.file.buffer);
      res.json(result);
    } catch (error: any) {
      console.error('CSV upload error:', error);
      res.status(500).json({ error: error.message || "Failed to upload CSV" });
    }
  });

  app.post("/api/data-import/switch-source", async (req, res) => {
    try {
      const { source } = req.body;
      if (source !== 'database' && source !== 'csv') {
        return res.status(400).json({ error: "Invalid data source" });
      }
      
      csvImportService.switchDataSource(source);
      res.json({ success: true, source });
    } catch (error) {
      res.status(500).json({ error: "Failed to switch data source" });
    }
  });

  app.delete("/api/data-import/files/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const success = csvImportService.deleteFile(filename);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "File not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Store original storage methods for CSV import service
  const originalStorage = { ...storage };

  const httpServer = createServer(app);
  return httpServer;
}
