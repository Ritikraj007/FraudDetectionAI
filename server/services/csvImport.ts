import { parse } from 'csv-parse';
import { createReadStream, writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { storage } from '../storage.js';

export interface ImportedFile {
  name: string;
  size: number;
  recordCount: number;
  uploadedAt: string;
  status: 'active' | 'inactive';
}

export class CSVImportService {
  private originalStorage: any;
  private uploadDir: string;
  private metadataFile: string;
  private currentDataSource: 'database' | 'csv' = 'database';
  private tempData: any[] = [];

  constructor(originalStorage: any) {
    this.originalStorage = originalStorage;
    this.uploadDir = join(process.cwd(), 'uploaded_data');
    this.metadataFile = join(this.uploadDir, 'metadata.json');
    
    // Create upload directory if it doesn't exist
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
    
    this.loadMetadata();
  }

  private loadMetadata() {
    try {
      if (existsSync(this.metadataFile)) {
        const metadata = JSON.parse(readFileSync(this.metadataFile, 'utf-8'));
        this.currentDataSource = metadata.currentDataSource || 'database';
        this.tempData = metadata.tempData || [];
      }
    } catch (error) {
      console.log('No metadata file found, using defaults');
    }
  }

  private saveMetadata() {
    const metadata = {
      currentDataSource: this.currentDataSource,
      tempData: this.tempData,
      lastUpdated: new Date().toISOString()
    };
    writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  async uploadCSV(filename: string, buffer: Buffer): Promise<{ recordCount: number; filename: string }> {
    return new Promise((resolve, reject) => {
      const records: any[] = [];
      const filePath = join(this.uploadDir, filename);
      
      // Save file to disk
      writeFileSync(filePath, buffer);
      
      // Parse CSV
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      parser.on('readable', () => {
        let record;
        while (record = parser.read()) {
          // Transform record to match telecom schema
          const transformedRecord = this.transformCSVRecord(record);
          if (transformedRecord) {
            records.push(transformedRecord);
          }
        }
      });

      parser.on('error', function(err) {
        reject(err);
      });

      parser.on('end', () => {
        // Store records in temporary storage
        this.tempData = records;
        
        // Automatically switch to CSV data source after successful upload
        this.currentDataSource = 'csv';
        this.saveMetadata();
        
        // Update file metadata
        const fileInfo: ImportedFile = {
          name: filename,
          size: buffer.length,
          recordCount: records.length,
          uploadedAt: new Date().toISOString(),
          status: 'active'
        };
        
        this.updateFileList(fileInfo);
        
        resolve({
          recordCount: records.length,
          filename: filename
        });
      });

      // Read and parse the file
      createReadStream(filePath).pipe(parser);
    });
  }

  private transformCSVRecord(record: any): any {
    try {
      // Transform CSV record to telecom activity format
      // This handles various CSV formats and maps them to our schema
      const transformed = {
        id: record.id || `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: record.user_id || record.userId || record.phone_number || record.phoneNumber || 'unknown',
        activityType: this.normalizeActivityType(record.activity_type || record.type || record.call_type || 'call'),
        timestamp: this.parseTimestamp(record.timestamp || record.date || record.call_date || new Date().toISOString()),
        durationSec: parseInt(record.duration || record.duration_sec || record.call_duration || '0'),
        location: record.location || record.city || record.region || 'Unknown',
        networkType: record.network_type || record.network || '4G',
        peerNumber: record.peer_number || record.called_number || record.recipient || 'unknown',
        isRoaming: this.parseBoolean(record.is_roaming || record.roaming || 'false'),
        isSpamOrFraud: this.parseBoolean(record.is_spam || record.is_fraud || record.spam || record.fraud || 'false'),
        dataUsageMB: parseFloat(record.data_usage || record.data_mb || '0'),
        cost: parseFloat(record.cost || record.charge || '0'),
        source: 'csv_import'
      };
      
      return transformed;
    } catch (error) {
      console.error('Error transforming CSV record:', error);
      return null;
    }
  }

  private normalizeActivityType(type: string): string {
    const normalized = type.toLowerCase().trim();
    if (normalized.includes('call') || normalized === 'voice') return 'call';
    if (normalized.includes('sms') || normalized === 'text') return 'sms';
    if (normalized.includes('data') || normalized === 'internet') return 'data';
    return 'call'; // default
  }

  private parseTimestamp(timestamp: string): Date {
    try {
      // Handle various date formats
      let date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // Try different formats
        const formats = [
          /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/, // YYYY-MM-DD HH:mm:ss
          /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/, // MM/DD/YYYY HH:mm:ss
          /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/, // DD-MM-YYYY HH:mm:ss
        ];
        
        for (const format of formats) {
          const match = timestamp.match(format);
          if (match) {
            if (format === formats[0]) {
              date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
            } else if (format === formats[1]) {
              date = new Date(`${match[3]}-${match[1]}-${match[2]}T${match[4]}:${match[5]}:${match[6]}`);
            } else {
              date = new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}`);
            }
            break;
          }
        }
      }
      
      return isNaN(date.getTime()) ? new Date() : date;
    } catch {
      return new Date();
    }
  }

  private parseBoolean(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private updateFileList(fileInfo: ImportedFile) {
    let fileList: ImportedFile[] = [];
    const fileListPath = join(this.uploadDir, 'files.json');
    
    if (existsSync(fileListPath)) {
      try {
        fileList = JSON.parse(readFileSync(fileListPath, 'utf-8'));
      } catch (error) {
        console.error('Error reading file list:', error);
      }
    }
    
    // Remove existing file with same name
    fileList = fileList.filter(f => f.name !== fileInfo.name);
    
    // Add new file
    fileList.push(fileInfo);
    
    // Save updated list
    writeFileSync(fileListPath, JSON.stringify(fileList, null, 2));
  }

  getUploadedFiles(): ImportedFile[] {
    const fileListPath = join(this.uploadDir, 'files.json');
    if (existsSync(fileListPath)) {
      try {
        return JSON.parse(readFileSync(fileListPath, 'utf-8'));
      } catch (error) {
        console.error('Error reading file list:', error);
      }
    }
    return [];
  }

  deleteFile(filename: string): boolean {
    try {
      const filePath = join(this.uploadDir, filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      
      // Update file list
      const fileListPath = join(this.uploadDir, 'files.json');
      if (existsSync(fileListPath)) {
        let fileList = JSON.parse(readFileSync(fileListPath, 'utf-8'));
        fileList = fileList.filter((f: ImportedFile) => f.name !== filename);
        writeFileSync(fileListPath, JSON.stringify(fileList, null, 2));
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  switchDataSource(source: 'database' | 'csv'): void {
    this.currentDataSource = source;
    this.saveMetadata();
  }

  getCurrentDataSource(): 'database' | 'csv' {
    return this.currentDataSource;
  }

  // Data access methods that respect the current data source
  async getTelecomActivities(userId?: string, limit?: number, timeRange?: string): Promise<any[]> {
    if (this.currentDataSource === 'csv' && this.tempData.length > 0) {
      let data = this.tempData;
      
      // Apply time range filter
      if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let startTime = new Date();
        
        switch (timeRange) {
          case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '24hours':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        
        data = data.filter(item => {
          const itemTime = new Date(item.timestamp);
          return itemTime >= startTime && itemTime <= now;
        });
      }
      
      if (userId) {
        data = data.filter(item => item.userId === userId);
      }
      if (limit) {
        data = data.slice(0, limit);
      }
      return data;
    }
    
    // Fallback to database
    return await this.originalStorage.getTelecomActivities(userId, limit);
  }

  async getTelecomFraudActivities(userId?: string, timeRange?: string): Promise<any[]> {
    if (this.currentDataSource === 'csv' && this.tempData.length > 0) {
      let data = this.tempData.filter(item => item.isSpamOrFraud);
      
      // Apply time range filter
      if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let startTime = new Date();
        
        switch (timeRange) {
          case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '24hours':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        
        data = data.filter(item => {
          const itemTime = new Date(item.timestamp);
          return itemTime >= startTime && itemTime <= now;
        });
      }
      
      if (userId) {
        data = data.filter(item => item.userId === userId);
      }
      
      return data;
    }
    
    return await this.originalStorage.getTelecomFraudActivities(userId);
  }

  async getTelecomActivityStats(timeRange?: string): Promise<any> {
    if (this.currentDataSource === 'csv' && this.tempData.length > 0) {
      let activities = this.tempData;
      
      // Apply time range filter
      if (timeRange && timeRange !== 'all') {
        const now = new Date();
        let startTime = new Date();
        
        switch (timeRange) {
          case 'hour':
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case '24hours':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        
        activities = activities.filter(activity => {
          const activityTime = new Date(activity.timestamp);
          return activityTime >= startTime && activityTime <= now;
        });
      }
      
      // Calculate stats from CSV data
      const callCount = activities.filter(a => a.activityType === 'call').length;
      const smsCount = activities.filter(a => a.activityType === 'sms').length;
      const fraudCount = activities.filter(a => a.isSpamOrFraud).length;
      
      const locationCounts = activities.reduce((acc: any, activity) => {
        acc[activity.location] = (acc[activity.location] || 0) + 1;
        return acc;
      }, {});
      
      const networkCounts = activities.reduce((acc: any, activity) => {
        acc[activity.networkType] = (acc[activity.networkType] || 0) + 1;
        return acc;
      }, {});
      
      return {
        totalActivities: activities.length,
        callCount,
        smsCount,
        fraudCount,
        fraudRate: activities.length > 0 ? fraudCount / activities.length : 0,
        topLocations: Object.entries(locationCounts)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([location, count]) => ({ location, count })),
        networkUsage: Object.entries(networkCounts)
          .map(([network, count]) => ({ network, count }))
      };
    }
    
    return await this.originalStorage.getTelecomActivityStats();
  }
}