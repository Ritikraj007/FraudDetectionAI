import { useState, useRef } from "react";
import { Upload, FileText, Database, Check, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface UploadedFile {
  name: string;
  size: number;
  recordCount: number;
  uploadedAt: string;
  status: 'active' | 'inactive';
}

export default function DataImport() {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current uploaded files
  const { data: uploadedFiles = [], isLoading } = useQuery({
    queryKey: ["/api/data-import/files"],
  });

  // Fetch current data source status
  const { data: dataSource } = useQuery({
    queryKey: ["/api/data-import/status"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/data-import/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: `Imported ${data.recordCount} records from ${data.filename}. Data source automatically switched to CSV.`,
      });
      // Invalidate all related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/data-import"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telecom"] });
      setUploadProgress(100);
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
      setIsUploading(false);
    },
  });

  const switchDataSourceMutation = useMutation({
    mutationFn: async (source: 'database' | 'csv') => {
      return apiRequest('POST', '/api/data-import/switch-source', { source });
    },
    onSuccess: (data, source) => {
      toast({
        title: "Data source switched",
        description: `System is now using ${source === 'csv' ? 'CSV files' : 'PostgreSQL database'}`,
      });
      // Invalidate all related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/data-import/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-import/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telecom"] });
    },
    onError: (error: any) => {
      toast({
        title: "Switch failed",
        description: error.message || "Failed to switch data source",
        variant: "destructive",
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (filename: string) => {
      return apiRequest('DELETE', `/api/data-import/files/${encodeURIComponent(filename)}`);
    },
    onSuccess: (data, filename) => {
      toast({
        title: "File deleted",
        description: `${filename} has been removed successfully`,
      });
      // Invalidate all related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["/api/data-import/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/data-import/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telecom"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete file",
        variant: "destructive",
      });
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    uploadMutation.mutate(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Import</h1>
          <p className="text-gray-600">Upload CSV files or switch to database source</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            Current: {dataSource?.source === 'csv' ? 'CSV Files' : 'PostgreSQL Database'}
          </Badge>
        </div>
      </div>

      {/* Data Source Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Source Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              dataSource?.source === 'database' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`} onClick={() => switchDataSourceMutation.mutate('database')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="h-8 w-8 text-blue-600" />
                  <div>
                    <h3 className="font-medium">PostgreSQL Database</h3>
                    <p className="text-sm text-gray-600">Use live database connection</p>
                  </div>
                </div>
                {dataSource?.source === 'database' && <Check className="h-5 w-5 text-blue-600" />}
              </div>
            </div>

            <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              dataSource?.source === 'csv' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
            }`} onClick={() => switchDataSourceMutation.mutate('csv')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-green-600" />
                  <div>
                    <h3 className="font-medium">CSV Files</h3>
                    <p className="text-sm text-gray-600">Use uploaded CSV data</p>
                  </div>
                </div>
                {dataSource?.source === 'csv' && <Check className="h-5 w-5 text-green-600" />}
              </div>
            </div>
          </div>

          {dataSource?.source === 'csv' && uploadedFiles.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No CSV files uploaded. Please upload a CSV file to use this data source.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload CSV Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className="space-y-4">
                <Upload className="h-12 w-12 text-blue-600 mx-auto animate-pulse" />
                <div>
                  <p className="text-lg font-medium">Uploading...</p>
                  <Progress value={uploadProgress} className="mt-2 max-w-xs mx-auto" />
                </div>
              </div>
            ) : (
              <>
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Drop your CSV file here</p>
                  <p className="text-gray-600">or click to browse files</p>
                  <p className="text-sm text-gray-500">Supports .csv files up to 10MB</p>
                </div>
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4"
                  disabled={isUploading}
                >
                  Select File
                </Button>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Uploaded Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadedFiles.map((file: UploadedFile) => (
                <div key={file.name} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <h3 className="font-medium">{file.name}</h3>
                      <p className="text-sm text-gray-600">
                        {formatFileSize(file.size)} • {file.recordCount.toLocaleString()} records
                      </p>
                      <p className="text-xs text-gray-500">
                        Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={file.status === 'active' ? 'default' : 'secondary'}>
                      {file.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteFileMutation.mutate(file.name)}
                      disabled={deleteFileMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}