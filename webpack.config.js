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
    vscode: 'commonjs vscode',
    // 不打包这些依赖，它们会在运行时从 node_modules 加载
    'axios': 'commonjs axios',
    'openai': 'commonjs openai',
    'simple-git': 'commonjs simple-git'
  },
  performance: {
    hints: false
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
