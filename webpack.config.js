const path = require('path');
const webpack = require('webpack');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: './src/extension.ts',
  target: 'node',
  mode: 'production',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  devtool: 'hidden-source-map',
  optimization: {
    minimize: true
  },
  externals: {
    vscode: 'commonjs vscode' // Keep only vscode as external
  },
  performance: {
    hints: false
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // Add module resolution configuration
    modules: [path.resolve(__dirname, 'src'), 'node_modules']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                moduleResolution: 'node'
              }
            }
          }
        ]
      }
    ]
  }
};
