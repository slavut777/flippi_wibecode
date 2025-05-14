                {mapMode === 'heatmap' && (
                  <div className="mt-2 p-2 glass-card flex items-center justify-center">
                    <div className="flex items-center space-x-8">
                      <span className="text-sm font-bold">Heat Map Legend:</span>
                      {heatmapMetric === 'price' ? (
                        <>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 0, 255, 0.3)' }}></div>
                            <span className="text-xs">Low Price</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 255, 0, 0.5)' }}></div>
                            <span className="text-xs">Medium Price</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(255, 0, 0, 0.7)' }}></div>
                            <span className="text-xs">High Price</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 0, 255, 0.3)' }}></div>
                            <span className="text-xs">Low Density</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(0, 255, 0, 0.5)' }}></div>
                            <span className="text-xs">Medium Density</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(255, 0, 0, 0.7)' }}></div>
                            <span className="text-xs">High Density</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}